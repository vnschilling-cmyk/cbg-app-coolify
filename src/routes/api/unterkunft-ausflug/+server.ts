import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureUnterkunftAusflug, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['unterkunft', 'titel', 'beschreibung', 'entfernung_km',
    'link', 'kategorie', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

/** POST /api/unterkunft-ausflug -> Ausflugsziel anlegen (nur Jugendleitung). */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    if (!((body?.unterkunft ?? '').toString())) {
        return json({ error: 'unterkunft nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkunftAusflug(pb);
        const rec = await pb.collection('unterkunft_ausflugsziele')
            .create(pick(body));
        return json({ item: rec });
    } catch (e: any) {
        console.error('POST /api/unterkunft-ausflug failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
