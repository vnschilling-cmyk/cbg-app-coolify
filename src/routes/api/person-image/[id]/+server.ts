import type { RequestHandler } from './$types';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';

const cors = { 'Access-Control-Allow-Origin': '*' };

export const OPTIONS: RequestHandler = async () =>
    new Response(null, { status: 204, headers: cors });

/**
 * Öffentlicher Avatar-Proxy: GET /api/person-image/{id}
 * Holt das Personenbild serverseitig aus ChurchTools und liefert die Bytes
 * mit CORS, damit die Flutter-Web-App es per <img> laden kann. Kein Bild → 404
 * (die App zeigt dann Initialen).
 */
export const GET: RequestHandler = async ({ params }) => {
    try {
        const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);
        const data: any = await client.request(`persons/${params.id}`);
        const p = data.data || data;
        const imageUrl: string | null =
            p.imageUrl || p.image?.fileUrl || p.image?.url || null;
        if (!imageUrl) return new Response(null, { status: 404, headers: cors });

        const res = await fetch(imageUrl);
        if (!res.ok) return new Response(null, { status: 404, headers: cors });
        const buf = await res.arrayBuffer();
        return new Response(buf, {
            status: 200,
            headers: {
                'Content-Type': res.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400',
                ...cors,
            },
        });
    } catch (e) {
        return new Response(null, { status: 404, headers: cors });
    }
};
