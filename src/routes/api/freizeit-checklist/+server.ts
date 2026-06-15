import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureFreizeitChecklist, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['freizeit', 'gruppe', 'titel', 'erledigt',
    'assignee_name', 'assignee_id', 'faellig', 'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

/** GET /api/freizeit-checklist?freizeit=ID -> Aufgaben + canEdit. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const freizeit = url.searchParams.get('freizeit') || '';
    if (!freizeit) return json({ error: 'freizeit nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureFreizeitChecklist(pb);
        const items = await pb.collection('freizeit_checklist').getFullList({
            filter: `freizeit="${freizeit}"`,
            sort: 'gruppe,sort_order,created',
        });
        return json({ items, canEdit: await isJugendLeitung(user) });
    } catch (e: any) {
        console.error('GET /api/freizeit-checklist failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/freizeit-checklist -> neue Aufgabe (nur Jugendleitung). */
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
    if (!((body?.freizeit ?? '').toString())) {
        return json({ error: 'freizeit nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureFreizeitChecklist(pb);
        const rec = await pb.collection('freizeit_checklist').create(pick(body));
        return json({ item: rec });
    } catch (e: any) {
        console.error('POST /api/freizeit-checklist failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
