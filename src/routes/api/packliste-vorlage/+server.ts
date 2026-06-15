import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensurePacklisteVorlage, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['kategorie', 'titel', 'pflicht', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

/** GET /api/packliste-vorlage -> zentrale Vorlage + canEdit. */
export const GET: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensurePacklisteVorlage(pb);
        const items = await pb.collection('packliste_vorlage').getFullList({
            sort: 'kategorie,sort_order,created',
        });
        return json({ items, canEdit: await isJugendLeitung(user) });
    } catch (e: any) {
        console.error('GET /api/packliste-vorlage failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/packliste-vorlage -> Vorlagen-Eintrag (nur Jugendleitung). */
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
    try {
        const pb = await adminPb();
        await ensurePacklisteVorlage(pb);
        const rec = await pb.collection('packliste_vorlage').create(pick(body));
        return json({ item: rec });
    } catch (e: any) {
        console.error('POST /api/packliste-vorlage failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
