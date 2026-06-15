import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkuenfte, ensureUnterkunftBilder,
    ensureUnterkunftAusflug, isJugendLeitung, pickUnterkunft,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/unterkuenfte/:id -> Unterkunft inkl. Bilder. */
export const GET: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensureUnterkuenfte(pb);
        await ensureUnterkunftBilder(pb);
        await ensureUnterkunftAusflug(pb);
        const rec = await pb.collection('unterkuenfte').getOne(params.id!);
        const bilder = await pb.collection('unterkunft_bilder').getFullList({
            filter: `unterkunft="${params.id}"`,
            sort: 'sort_order,created',
        });
        const ausflugsziele = await pb
            .collection('unterkunft_ausflugsziele').getFullList({
                filter: `unterkunft="${params.id}"`,
                sort: 'sort_order,created',
            });
        return json({
            unterkunft: rec,
            bilder,
            ausflugsziele,
            canEdit: await isJugendLeitung(user),
        });
    } catch (e: any) {
        console.error('GET /api/unterkuenfte/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** PATCH /api/unterkuenfte/:id -> bearbeiten (nur Jugendleitung). */
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
        await ensureUnterkuenfte(pb);
        const rec = await pb.collection('unterkuenfte')
            .update(params.id!, pickUnterkunft(body));
        return json({ unterkunft: rec });
    } catch (e: any) {
        console.error('PATCH /api/unterkuenfte/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/unterkuenfte/:id -> löschen inkl. Bilder (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkuenfte(pb);
        await ensureUnterkunftBilder(pb);
        // zugehörige Bilder mit entfernen
        const bilder = await pb.collection('unterkunft_bilder').getFullList({
            filter: `unterkunft="${params.id}"`,
        });
        for (const b of bilder) {
            await pb.collection('unterkunft_bilder').delete(b.id);
        }
        await pb.collection('unterkuenfte').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/unterkuenfte/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
