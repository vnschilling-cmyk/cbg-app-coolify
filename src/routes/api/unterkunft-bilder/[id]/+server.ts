import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureUnterkunftBilder, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** DELETE /api/unterkunft-bilder/:id -> Bild löschen (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkunftBilder(pb);
        await pb.collection('unterkunft_bilder').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/unterkunft-bilder/:id failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
