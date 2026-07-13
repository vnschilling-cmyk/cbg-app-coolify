import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkuenfte, isJugendLeitung, pickUnterkunft,
    unterkunftGesamtnote,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/unterkuenfte -> Pool (beste Note zuerst) + canEdit. */
export const GET: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensureUnterkuenfte(pb);
        // Ohne server-seitigen Sort laden (kann in PB 500en) und die Note je
        // Datensatz frisch aus den Sternen (r_*) berechnen -> selbstheilend,
        // auch wenn ein gespeichertes `gesamtnote` mal veraltet/0 war.
        const list = await pb.collection('unterkuenfte').getFullList();
        for (const r of list as any[]) {
            r.gesamtnote = unterkunftGesamtnote(r);
        }
        list.sort((a: any, b: any) => {
            const d = Number(b.gesamtnote ?? 0) - Number(a.gesamtnote ?? 0);
            if (d !== 0) return d;
            return `${a.name ?? ''}`.localeCompare(`${b.name ?? ''}`);
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
