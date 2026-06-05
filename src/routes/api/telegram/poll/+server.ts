/**
 * GET /api/telegram/poll  (Aufnahme neuer Agenda-Vorschläge aus Telegram)
 * Liest neue Nachrichten (getUpdates) und überträgt Textnachrichten aus dem
 * Agenda-Thema automatisch als Punkte in die neueste Agenda – mit Absender
 * (Name + Telegram-User-ID für den Avatar).
 *
 * Auth: ?key=<TELEGRAM_POLL_KEY> (für Cron) ODER angemeldeter Nutzer.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureAppConfig,
    getConfig,
    setConfig,
    agendaSuggestionFromMessage,
    appendAgendaSuggestions,
} from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET({ request, url }) {
    // Zugriff: Cron-Key oder angemeldeter Nutzer.
    let ok = false;
    const key = url.searchParams.get('key') || '';
    if (key && env.TELEGRAM_POLL_KEY && key === env.TELEGRAM_POLL_KEY) ok = true;
    if (!ok) {
        const { user } = await pbFromRequest(request);
        if (user) ok = true;
    }
    if (!ok) return json({ error: 'Unauthorized' }, 401);

    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) return json({ error: 'Kein Telegram-Token.' }, 400);
    const agendaThread = (env.TELEGRAM_TOPIC_AGENDA || '').toString();

    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);

        const offCfg = await getConfig(pb, 'telegram_offset');
        const offset = typeof offCfg?.offset === 'number' ? offCfg.offset : 0;

        const r = await fetch(
            `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${offset + 1}&allowed_updates=["message"]`);
        const j: any = await r.json();
        if (!j.ok) return json({ error: j.description || 'getUpdates fehlgeschlagen' }, 502);

        const updates: any[] = j.result || [];
        let maxId = offset;
        const suggestions: { text: string; name: string; tgUserId: string }[] = [];
        for (const u of updates) {
            if (typeof u.update_id === 'number' && u.update_id > maxId) {
                maxId = u.update_id;
            }
            const s = agendaSuggestionFromMessage(u.message, agendaThread);
            if (s) suggestions.push(s);
        }

        // Zerlegt per KI in echte Themen und fügt sie vor „Abschluss" ein.
        const added = await appendAgendaSuggestions(pb, suggestions);

        if (maxId !== offset) {
            await setConfig(pb, 'telegram_offset', { offset: maxId });
        }
        return json({ ok: true, received: updates.length, added });
    } catch (e: any) {
        return json({ error: e?.message || 'Polling fehlgeschlagen' }, 500);
    }
}
