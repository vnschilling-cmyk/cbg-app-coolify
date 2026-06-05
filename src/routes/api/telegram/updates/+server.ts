/**
 * GET /api/telegram/updates  (Einrichtung)
 * Liest getUpdates des Bots und liefert die erkannten Chats/Themen
 * (chatId, Titel, threadId, ggf. Themenname, kurzer Text) – damit man die
 * Chat-ID und die Themen-IDs für TELEGRAM_CHAT_ID / TELEGRAM_TOPIC_* findet.
 * Liefert KEINE Geheimnisse. Nach der Einrichtung kann der Endpunkt weg.
 */
import { json, preflight } from '$lib/server/api';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET() {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        return json({ error: 'TELEGRAM_BOT_TOKEN ist in Coolify nicht gesetzt.' }, 400);
    }
    try {
        const r = await fetch(
            `https://api.telegram.org/bot${token}/getUpdates?limit=100`);
        const j: any = await r.json();
        if (!j.ok) {
            return json({ error: j.description || 'Telegram getUpdates fehlgeschlagen' }, 502);
        }
        const updates: any[] = [];
        for (const u of (j.result || [])) {
            const m = u.message || u.channel_post || u.edited_message;
            if (!m) continue;
            updates.push({
                chatId: m.chat?.id,
                chatTitle: m.chat?.title || m.chat?.username || '',
                chatType: m.chat?.type,
                isForum: m.chat?.is_forum === true,
                threadId: m.message_thread_id ?? null,
                topicName: m.forum_topic_created?.name ??
                    m.forum_topic_edited?.name ?? null,
                text: (m.text || m.caption || '').toString().slice(0, 80),
            });
        }
        return json({ ok: true, count: updates.length, updates });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
