/**
 * GET /api/telegram/set-webhook  (einmalige Einrichtung, nur über HTTPS sinnvoll)
 * Registriert den Telegram-Webhook auf die EIGENE Origin-URL + Secret-Token.
 * Muss über die HTTPS-Adresse aufgerufen werden, damit die URL https ist.
 */
import { json, preflight } from '$lib/server/api';
import { adminPb, ensureAppConfig, getConfig, setConfig, genId }
    from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET({ url }) {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) return json({ error: 'Kein Telegram-Token.' }, 400);
    if (url.protocol !== 'https:') {
        return json({
            error: 'Bitte über die HTTPS-Adresse aufrufen '
                + `(aktuell: ${url.origin}). Telegram-Webhooks brauchen HTTPS.`,
        }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);
        let secret = (await getConfig(pb, 'telegram_webhook_secret'))?.secret;
        if (!secret) {
            secret = genId() + genId();
            await setConfig(pb, 'telegram_webhook_secret', { secret });
        }
        const hookUrl = `${url.origin}/api/telegram/webhook`;
        const r = await fetch(
            `https://api.telegram.org/bot${token}/setWebhook`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: hookUrl,
                    secret_token: secret,
                    allowed_updates: ['message'],
                    drop_pending_updates: true,
                }),
            });
        const j: any = await r.json();
        return json({ ok: j.ok, url: hookUrl, telegram: j });
    } catch (e: any) {
        return json({ error: e?.message || 'setWebhook fehlgeschlagen' }, 500);
    }
}
