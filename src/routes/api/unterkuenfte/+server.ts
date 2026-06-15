import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkuenfte, isJugendLeitung, pickUnterkunft,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/unterkuenfte -> Pool (beste Note zuerst) + canEdit. */
export const GET: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensureUnterkuenfte(pb);
        const list = await pb.collection('unterkuenfte').getFullList({
            sort: '-gesamtnote,name',
        });
        return json({ unterkuenfte: list, canEdit: await isJugendLeitung(user) });
    } catch (e: any) {
        console.error('GET /api/unterkuenfte failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/unterkuenfte -> neue Unterkunft (nur Jugendleitung). */
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
    if (!((body?.name ?? '').toString().trim())) {
        return json({ error: 'Name ist nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkuenfte(pb);
        const rec = await pb.collection('unterkuenfte').create(pickUnterkunft(body));
        return json({ unterkunft: rec });
    } catch (e: any) {
        console.error('POST /api/unterkuenfte failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
