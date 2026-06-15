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

/** PATCH /api/packliste-vorlage/:id (nur Jugendleitung). */
export const PATCH: RequestHandler = async ({ request, params }) => {
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
        const rec = await pb.collection('packliste_vorlage')
            .update(params.id!, pick(body));
        return json({ item: rec });
    } catch (e: any) {
        console.error('PATCH /api/packliste-vorlage failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/packliste-vorlage/:id (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensurePacklisteVorlage(pb);
        await pb.collection('packliste_vorlage').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/packliste-vorlage failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
