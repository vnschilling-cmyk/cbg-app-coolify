import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureGemeinden } from '$lib/server/admin';
import { gemeindenAccess, geocodeAddress } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

/** Zeitbudget je Aufruf (Nominatim erlaubt nur ~1 Anfrage pro Sekunde). */
const BUDGET_MS = 20000;

/**
 * POST /api/gemeinden/geocode -> ermittelt Standorte für Gemeinden ohne
 * Koordinaten, so viele wie in ~20 s passen. Die App ruft das wiederholt
 * auf, bis `remaining` 0 ist. Body { retry?: true } nimmt auch die zuvor
 * nicht gefundenen Adressen erneut dran.
 */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if ((await gemeindenAccess(user)) !== 'bearbeiten') {
        return json({ error: 'Keine Berechtigung' }, 403);
    }
    let body: any = {};
    try {
        body = await request.json();
    } catch { /* leerer Body erlaubt */ }
    const filter = body?.retry === true
        ? 'geo_status="" || geo_status="fehler"'
        : 'geo_status=""';
    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        const start = Date.now();
        const page = await pb.collection('gemeinden').getList(1, 40, { filter });
        let done = 0;
        let notFound = 0;
        for (const g of page.items as any[]) {
            if (Date.now() - start > BUDGET_MS) break;
            const r = await geocodeAddress(
                `${g.strasse ?? ''}`, `${g.plz ?? ''}`, `${g.ort ?? ''}`);
            await pb.collection('gemeinden').update(g.id, r.status === 'fehler'
                ? { lat: null, lng: null, geo_status: 'fehler' }
                : { lat: r.lat, lng: r.lng, geo_status: r.status });
            done++;
            if (r.status === 'fehler') notFound++;
        }
        return json({ done, notFound, remaining: Math.max(0, page.totalItems - done) });
    } catch (e: any) {
        console.error('POST /api/gemeinden/geocode failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
