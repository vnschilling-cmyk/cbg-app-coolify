import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { fahrstrecken, gemeindenAccess, type Ziel } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
};

/**
 * POST /api/gemeinden/fahrstrecke -> Fahrstrecke/-zeit mit dem Auto.
 * Body { lat, lng, ziele: [{id, lat, lng}] } (max. 80 Ziele).
 * Antwort { strecken: { [id]: { km, min } } }.
 */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await gemeindenAccess(user))) return json({ error: 'Kein Zugriff' }, 403);
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    const lat = num(body?.lat);
    const lng = num(body?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return json({ error: 'Startpunkt fehlt' }, 400);
    }
    const ziele: Ziel[] = (Array.isArray(body?.ziele) ? body.ziele : [])
        .map((z: any) => ({ id: `${z?.id ?? ''}`, lat: num(z?.lat), lng: num(z?.lng) }))
        .filter((z: Ziel) => z.id && !Number.isNaN(z.lat) && !Number.isNaN(z.lng));
    if (!ziele.length) return json({ strecken: {} });
    try {
        return json({ strecken: await fahrstrecken(lat, lng, ziele) });
    } catch (e: any) {
        console.error('POST /api/gemeinden/fahrstrecke failed:', e?.message || e);
        return json({ error: 'Routing nicht erreichbar' }, 502);
    }
};
