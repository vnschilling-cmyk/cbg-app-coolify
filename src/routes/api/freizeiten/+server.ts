import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureFreizeiten, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['titel', 'jahr', 'land', 'motto', 'thema', 'von', 'bis',
    'status', 'unterkunft', 'teilnehmer_beitrag'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) {
        if (body[f] !== undefined) out[f] = body[f];
    }
    return out;
}

/** GET /api/freizeiten -> alle Jugendfreizeiten (neueste zuerst). */
export const GET: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensureFreizeiten(pb);
        const list = await pb.collection('freizeiten').getFullList({
            sort: '-jahr,-von,titel',
        });
        return json({ freizeiten: list, canEdit: await isJugendLeitung(user) });
    } catch (e: any) {
        console.error('GET /api/freizeiten failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/freizeiten -> neue Freizeit anlegen (nur Jugendleitung). */
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
    if (!((body?.titel ?? '').toString().trim())) {
        return json({ error: 'Titel ist nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureFreizeiten(pb);
        const rec = await pb.collection('freizeiten').create(pick(body));
        return json({ freizeit: rec });
    } catch (e: any) {
        console.error('POST /api/freizeiten failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
