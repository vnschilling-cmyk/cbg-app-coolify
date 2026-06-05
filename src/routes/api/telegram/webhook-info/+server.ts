/**
 * GET /api/telegram/webhook-info  (Diagnose)
 * Zeigt getWebhookInfo: URL, ausstehende Updates, letzter Fehler.
 */
import { json, preflight } from '$lib/server/api';
import { adminPb, ensureAppConfig, getConfig } from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET() {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) return json({ error: 'Kein Telegram-Token.' }, 400);
    try {
        const r = await fetch(
            `https://api.telegram.org/bot${token}/getWebhookInfo`);
        const j: any = await r.json();
        let lastUpdate: any = null;
        try {
            const pb = await adminPb();
            await ensureAppConfig(pb);
            lastUpdate = await getConfig(pb, 'telegram_last_update');
        } catch { /* optional */ }
        return json({
            agendaThread: (env.TELEGRAM_TOPIC_AGENDA || '').toString(),
            chatId: (env.TELEGRAM_CHAT_ID || '').toString(),
            info: j?.result ?? j,
            lastUpdate,
        });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
