import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureGemeinden } from '$lib/server/admin';
import { gemeindenAccess, geocodeAddress, pickGemeinde } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/gemeinden -> alle Gemeinden (nach Ort sortiert) + canEdit. */
export const GET: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const access = await gemeindenAccess(user);
    if (!access) return json({ error: 'Kein Zugriff' }, 403);
    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        // Ohne server-seitigen Sort laden (kann in PB 500en), in JS sortieren.
        const list = await pb.collection('gemeinden').getFullList();
        list.sort((a: any, b: any) =>
            `${a.ort ?? ''}`.localeCompare(`${b.ort ?? ''}`, 'de')
            || `${a.name ?? ''}`.localeCompare(`${b.name ?? ''}`, 'de'));
        return json({ gemeinden: list, canEdit: access === 'bearbeiten' });
    } catch (e: any) {
        console.error('GET /api/gemeinden failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/gemeinden -> neue Gemeinde (Standort wird ermittelt). */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if ((await gemeindenAccess(user)) !== 'bearbeiten') {
        return json({ error: 'Keine Berechtigung' }, 403);
    }
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    const data = pickGemeinde(body);
    if (!`${data.name ?? ''}`) return json({ error: 'Name ist nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        if (data.plz || data.ort) {
            try {
                const g = await geocodeAddress(
                    `${data.strasse ?? ''}`, `${data.plz ?? ''}`, `${data.ort ?? ''}`);
                Object.assign(data, g.status === 'fehler'
                    ? { lat: null, lng: null, geo_status: 'fehler' }
                    : { lat: g.lat, lng: g.lng, geo_status: g.status });
            } catch (e: any) {
                // Standort später über „Standorte ermitteln" nachholen.
                console.error('geocode on create failed:', e?.message || e);
                data.geo_status = '';
            }
        }
        const rec = await pb.collection('gemeinden').create(data);
        return json({ gemeinde: rec });
    } catch (e: any) {
        console.error('POST /api/gemeinden failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
