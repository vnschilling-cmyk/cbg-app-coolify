import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkunftDokumente, isJugendLeitung,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * GET /api/unterkunft-dokumente?unterkunft=ID -> Liste (ohne pdf_b64).
 * { dokumente: [{id, typ, name, sort_order}], canEdit }.
 */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const unterkunft = url.searchParams.get('unterkunft') || '';
    if (!unterkunft) return json({ error: 'unterkunft nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureUnterkunftDokumente(pb);
        const dokumente = await pb.collection('unterkunft_dokumente').getFullList({
            filter: `unterkunft="${unterkunft}"`,
            sort: 'sort_order,created',
            fields: 'id,typ,name,sort_order,created',
        });
        return json({ dokumente, canEdit: await isJugendLeitung(user) });
    } catch (e: any) {
        console.error('GET /api/unterkunft-dokumente failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/**
 * POST /api/unterkunft-dokumente -> PDF anhängen. Nur Jugendleitung.
 * Body { unterkunft, typ, name, pdf_b64, sort_order? }.
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
    const pdf = (body?.pdf_b64 ?? '').toString();
    if (!unterkunft || !pdf) {
        return json({ error: 'unterkunft und pdf_b64 sind nötig' }, 400);
    }
    try {
        const pb = await adminPb();
        await ensureUnterkunftDokumente(pb);
        const rec = await pb.collection('unterkunft_dokumente').create({
            unterkunft,
            typ: (body?.typ ?? 'sonstiges').toString(),
            name: (body?.name ?? '').toString(),
            pdf_b64: pdf,
            sort_order: Number(body?.sort_order ?? 0),
        });
        return json({ dokument: { id: rec.id } });
    } catch (e: any) {
        const detail = e?.response?.data ?? e?.data ?? null;
        console.error('POST /api/unterkunft-dokumente failed:', e?.message || e,
            detail ? JSON.stringify(detail) : '');
        const msg = detail
            ? `${e?.message || 'Fehler'} – ${JSON.stringify(detail)}`
            : (e?.message || 'Fehler');
        return json({ error: msg }, 500);
    }
};
