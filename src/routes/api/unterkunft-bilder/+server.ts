import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureUnterkunftGalerie, isJugendLeitung } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * POST /api/unterkunft-bilder -> Bild (Base64-Data-URL) zu einer Unterkunft
 * anhängen. Body { unterkunft, name, b64, sort_order? }. Nur Jugendleitung.
 */
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
    const unterkunft = (body?.unterkunft ?? '').toString();
    const b64 = (body?.b64 ?? '').toString();
    if (!unterkunft || !b64) {
        return json({ error: 'unterkunft und b64 sind nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkunftGalerie(pb);
        const rec = await pb.collection('unterkunft_galerie').create({
            unterkunft,
            bereich: (body?.bereich ?? '').toString(),
            name: (body?.name ?? '').toString(),
            bild_b64: b64,
            sort_order: Number(body?.sort_order ?? 0),
        });
        return json({ bild: { id: rec.id } });
    } catch (e: any) {
        // Validierungsdetails von PocketBase mitloggen + zurückgeben.
        const detail = e?.response?.data ?? e?.data ?? null;
        console.error('POST /api/unterkunft-bilder failed:', e?.message || e,
            detail ? JSON.stringify(detail) : '');
        const msg = detail
            ? `${e?.message || 'Fehler'} – ${JSON.stringify(detail)}`
            : (e?.message || 'Fehler');
        return json({ error: msg }, 500);
    }
};
