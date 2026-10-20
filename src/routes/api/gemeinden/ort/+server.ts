import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { gemeindenAccess, searchPlace } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/gemeinden/ort?q=… -> Orte für die Umkreissuche [{label,lat,lng}]. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await gemeindenAccess(user))) return json({ error: 'Kein Zugriff' }, 403);
    const q = (url.searchParams.get('q') || '').slice(0, 200);
    if (!q.trim()) return json({ orte: [] });
    try {
        return json({ orte: await searchPlace(q) });
    } catch (e: any) {
        console.error('GET /api/gemeinden/ort failed:', e?.message || e);
        return json({ error: 'Ortssuche nicht erreichbar' }, 502);
    }
};
