import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureGemeinden } from '$lib/server/admin';
import { gemeindenAccess, geocodeAddress, pickGemeinde } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * PATCH /api/gemeinden/:id -> bearbeiten. Ändert sich die Adresse, wird der
 * Standort neu ermittelt; mitgeschickte lat/lng gelten als manuell gesetzt.
 */
export const PATCH: RequestHandler = async ({ request, params }) => {
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
    const patch = pickGemeinde(body);
    if ('name' in patch && !`${patch.name}`) {
        return json({ error: 'Name ist nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        const existing: any = await pb.collection('gemeinden').getOne(params.id!);
        if ('lat' in patch && 'lng' in patch && patch.lat != null && patch.lng != null) {
            patch.geo_status = 'manuell';
        } else {
            delete patch.lat;
            delete patch.lng;
            const next = { ...existing, ...patch };
            const moved = ['strasse', 'plz', 'ort'].some(
                (f) => f in patch && `${patch[f]}` !== `${existing[f] ?? ''}`);
            if (moved && (next.plz || next.ort)) {
                try {
                    const g = await geocodeAddress(
                        `${next.strasse ?? ''}`, `${next.plz ?? ''}`, `${next.ort ?? ''}`);
                    Object.assign(patch, g.status === 'fehler'
                        ? { lat: null, lng: null, geo_status: 'fehler' }
                        : { lat: g.lat, lng: g.lng, geo_status: g.status });
                } catch (e: any) {
                    console.error('geocode on patch failed:', e?.message || e);
                    patch.geo_status = '';
                }
            }
        }
        const rec = await pb.collection('gemeinden').update(params.id!, patch);
        return json({ gemeinde: rec });
    } catch (e: any) {
        console.error('PATCH /api/gemeinden/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/gemeinden/:id -> löschen (inkl. Kontakte im Datensatz). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if ((await gemeindenAccess(user)) !== 'bearbeiten') {
        return json({ error: 'Keine Berechtigung' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        await pb.collection('gemeinden').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/gemeinden/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
