import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkunftDokumente, isJugendLeitung,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/unterkunft-dokumente/:id -> { pdf_b64, name, typ } (zum Ansehen). */
export const GET: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        const pb = await adminPb();
        await ensureUnterkunftDokumente(pb);
        const rec = await pb.collection('unterkunft_dokumente').getOne(params.id!);
        return json({
            pdf_b64: (rec.pdf_b64 ?? '').toString(),
            name: (rec.name ?? '').toString(),
            typ: (rec.typ ?? '').toString(),
        });
    } catch (e: any) {
        console.error('GET /api/unterkunft-dokumente/[id] failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** DELETE /api/unterkunft-dokumente/:id -> löschen (nur Jugendleitung). */
export const DELETE: RequestHandler = async ({ request, params }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!(await isJugendLeitung(user))) {
        return json({ error: 'Keine Berechtigung (nur Jugendleitung)' }, 403);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkunftDokumente(pb);
        await pb.collection('unterkunft_dokumente').delete(params.id!);
        return json({ ok: true });
    } catch (e: any) {
        console.error('DELETE /api/unterkunft-dokumente/[id] failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
