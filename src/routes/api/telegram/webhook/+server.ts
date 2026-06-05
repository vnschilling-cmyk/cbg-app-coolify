/**
 * POST /api/telegram/webhook
 * Telegram ruft diesen Endpunkt bei neuen Nachrichten auf (nur HTTPS).
 * Verifiziert das Secret-Token und übernimmt Agenda-Thema-Nachrichten sofort.
 */
import { json, preflight } from '$lib/server/api';
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

export async function POST({ request }) {
    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);

        // Secret-Token prüfen (gegen Fremdaufrufe).
        const cfg = await getConfig(pb, 'telegram_webhook_secret');
        const secret = (cfg?.secret || '').toString();
        const hdr = request.headers.get('x-telegram-bot-api-secret-token') || '';
        if (secret && hdr !== secret) {
            return new Response('forbidden', { status: 401 });
        }

        let update: any;
        try { update = await request.json(); } catch { update = {}; }
        const agendaThread = (env.TELEGRAM_TOPIC_AGENDA || '').toString();
        const m = update?.message;
        const s = agendaSuggestionFromMessage(m, agendaThread);
        let added = 0;
        if (s) {
            try {
                added = await appendAgendaSuggestions(pb, [s]);
            } catch (e: any) {
                console.error('webhook append failed:', e?.message || e);
            }
        }
        // Diagnose: letzte empfangene Nachricht festhalten.
        try {
            await setConfig(pb, 'telegram_last_update', {
                at: new Date().toISOString(),
                thread: (m?.message_thread_id ?? '').toString(),
                expectedThread: agendaThread,
                threadMatch: !agendaThread ||
                    (m?.message_thread_id ?? '').toString() === agendaThread,
                text: (m?.text ?? '').toString(),
                from: `${m?.from?.first_name || ''} ${m?.from?.last_name || ''}`.trim(),
                isBot: !!m?.from?.is_bot,
                chatId: (m?.chat?.id ?? '').toString(),
                accepted: !!s,
                added,
            });
        } catch { /* Diagnose ist optional */ }
        return json({ ok: true });
    } catch (e: any) {
        console.error('telegram webhook:', e?.message || e);
        // Trotzdem 200, damit Telegram nicht endlos retryt.
        return json({ ok: false });
    }
}
