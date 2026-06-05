/**
 * POST /api/telegram/send  { topic, filename, b64, caption? }
 * Sendet ein PDF per Telegram-Bot an den konfigurierten Chat + Thema.
 * topic: 'agenda' -> TELEGRAM_TOPIC_AGENDA, 'protokoll' -> TELEGRAM_TOPIC_PROTOKOLL.
 * Geheimnisse/IDs kommen aus Coolify-Env (Token nie im Client).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const token = env.TELEGRAM_BOT_TOKEN;
        if (!token) return json({ error: 'Kein Telegram-Token konfiguriert.' }, 400);
        const chat = env.TELEGRAM_CHAT_ID;
        if (!chat) return json({ error: 'TELEGRAM_CHAT_ID nicht gesetzt.' }, 400);

        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const topic = (body?.topic || '').toString();
        const b64 = (body?.b64 || '').toString();
        const filename = (body?.filename || 'dokument.pdf').toString();
        const caption = (body?.caption || '').toString();
        if (!b64) return json({ error: 'Keine PDF-Daten übermittelt.' }, 400);

        const thread = topic === 'agenda'
            ? env.TELEGRAM_TOPIC_AGENDA
            : topic === 'protokoll'
                ? env.TELEGRAM_TOPIC_PROTOKOLL
                : '';

        const buf = Buffer.from(b64, 'base64');
        const form = new FormData();
        form.append('chat_id', String(chat));
        if (thread) form.append('message_thread_id', String(thread));
        if (caption) form.append('caption', caption);
        form.append('document',
            new Blob([buf], { type: 'application/pdf' }), filename);

        const r = await fetch(
            `https://api.telegram.org/bot${token}/sendDocument`,
            { method: 'POST', body: form });
        const j: any = await r.json();
        if (!j.ok) {
            return json({ error: j.description || 'Telegram-Versand fehlgeschlagen' }, 502);
        }
        return json({ ok: true });
    } catch (e: any) {
        return json({ error: e?.message || 'Versand fehlgeschlagen' }, 500);
    }
}
