import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureFreizeitAusgaben, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['kategorie', 'bezeichnung', 'betrag', 'datum', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

/** PATCH /api/freizeit-ausgaben/:id -> Ausgabe bearbeiten (nur Jugendleitung). */
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
        await ensureFreizeitAusgaben(pb);
        const rec = await pb.collection('freizeit_ausgaben').update(params.id!, pick(body));
        return json({ ausgabe: rec });
    } catch (e: any) {
        console.error('PATCH /api/freizeit-ausgaben failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/freizeit-ausgaben/:id -> Ausgabe löschen (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureFreizeitAusgaben(pb);
        await pb.collection('freizeit_ausgaben').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/freizeit-ausgaben failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
