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
    genId,
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
            const m = u.message;
            if (!m) continue;
            const thread = (m.message_thread_id ?? '').toString();
            // Nur Textnachrichten im Agenda-Thema, nicht vom Bot, keine Doks.
            if (agendaThread && thread !== agendaThread) continue;
            if (!m.text) continue;
            if (m.from?.is_bot) continue;
            if (m.forum_topic_created || m.forum_topic_edited) continue;
            const name = `${m.from?.first_name || ''} ${m.from?.last_name || ''}`
                .trim() || (m.from?.username || '').toString();
            suggestions.push({
                text: m.text.toString(),
                name,
                tgUserId: m.from?.id != null ? String(m.from.id) : '',
            });
        }

        let added = 0;
        if (suggestions.length) {
            const agendas = ((await getConfig(pb, 'bruderrat_agendas')) as any[]) || [];
            const list = Array.isArray(agendas) ? agendas : [];
            if (list.length) {
                // Neueste Agenda (nach Datum, sonst erste).
                list.sort((a, b) =>
                    (b?.date || '').toString().localeCompare((a?.date || '').toString()));
                const ag = list[0];
                ag.items = Array.isArray(ag.items) ? ag.items : [];
                let top = ag.items.find((it: any) =>
                    /weitere punkte/i.test((it?.title || '').toString()));
                if (!top) {
                    top = { title: 'Weitere Punkte (aus Telegram)', points: [] };
                    ag.items.push(top);
                }
                top.points = Array.isArray(top.points) ? top.points : [];
                const seen = new Set(
                    top.points.map((p: any) =>
                        `${(p?.text || '').toString()}|${(p?.tgUserId || '').toString()}`));
                for (const s of suggestions) {
                    const k = `${s.text}|${s.tgUserId}`;
                    if (seen.has(k)) continue;
                    seen.add(k);
                    top.points.push({
                        id: genId(),
                        text: s.text,
                        name: s.name,
                        tgUserId: s.tgUserId,
                    });
                    added++;
                }
                if (added) await setConfig(pb, 'bruderrat_agendas', list);
            }
        }

        if (maxId !== offset) {
            await setConfig(pb, 'telegram_offset', { offset: maxId });
        }
        return json({ ok: true, received: updates.length, added });
    } catch (e: any) {
        return json({ error: e?.message || 'Polling fehlgeschlagen' }, 500);
    }
}
