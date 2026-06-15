import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureUnterkunftBilder, isJugendLeitung } from '$lib/server/admin';

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
        await ensureUnterkunftBilder(pb);
        const rec = await pb.collection('unterkunft_bilder').create({
            unterkunft,
            name: (body?.name ?? '').toString(),
            bild_b64: b64,
            sort_order: Number(body?.sort_order ?? 0),
        });
        return json({ bild: { id: rec.id } });
    } catch (e: any) {
        console.error('POST /api/unterkunft-bilder failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
