import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureFreizeitHelfer, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['person_name', 'person_id', 'rolle', 'notiz', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

/** PATCH /api/freizeit-helfer/:id -> Helfer ändern (nur Jugendleitung). */
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
        await ensureFreizeitHelfer(pb);
        const rec = await pb.collection('freizeit_helfer')
            .update(params.id!, pick(body));
        return json({ item: rec });
    } catch (e: any) {
        console.error('PATCH /api/freizeit-helfer failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/freizeit-helfer/:id -> Helfer entfernen (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureFreizeitHelfer(pb);
        await pb.collection('freizeit_helfer').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/freizeit-helfer failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
