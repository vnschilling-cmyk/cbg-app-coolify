/**
 * GET /api/telegram/avatar/{userId}
 * Öffentlicher Proxy für das Telegram-Profilbild eines Absenders
 * (getUserProfilePhotos -> getFile -> Datei). Kein Bild -> 404 (Initialen).
 */
import { env } from '$env/dynamic/private';

const cors = { 'Access-Control-Allow-Origin': '*' };
export const OPTIONS = async () =>
    new Response(null, { status: 204, headers: cors });

export async function GET({ params }) {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) return new Response(null, { status: 404, headers: cors });
    try {
        const photos: any = await (await fetch(
            `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${params.userId}&limit=1`)).json();
        const sizes = photos?.result?.photos?.[0];
        if (!sizes || !sizes.length) {
            return new Response(null, { status: 404, headers: cors });
        }
        const fileId = sizes[sizes.length - 1].file_id; // größte Variante
        const fileRes: any = await (await fetch(
            `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)).json();
        const path = fileRes?.result?.file_path;
        if (!path) return new Response(null, { status: 404, headers: cors });
        const img = await fetch(
            `https://api.telegram.org/file/bot${token}/${path}`);
        if (!img.ok) return new Response(null, { status: 404, headers: cors });
        const buf = await img.arrayBuffer();
        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': img.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
                ...cors,
            },
        });
    } catch (_) {
        return new Response(null, { status: 404, headers: cors });
    }
}
