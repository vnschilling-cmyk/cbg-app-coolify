import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureFreizeitAusgaben, ensureFreizeitTeilnehmer,
    ensureFreizeiten, isJugendLeitung,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['freizeit', 'kategorie', 'bezeichnung', 'betrag', 'datum',
    'sort_order'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);

/** Einnahmen aus den Teilnehmern (bezahlt · Betrag bzw. Standardbeitrag). */
async function einnahmenOf(pb: any, freizeit: string): Promise<number> {
    let beitrag = 0;
    try {
        await ensureFreizeiten(pb);
        const fz = await pb.collection('freizeiten').getOne(freizeit);
        beitrag = num(fz.teilnehmer_beitrag);
    } catch { /* ignore */ }
    try {
        await ensureFreizeitTeilnehmer(pb);
        const tn = await pb.collection('freizeit_teilnehmer').getFullList({
            filter: `freizeit="${freizeit}"`,
        });
        return tn
            .filter((t: any) => num(t.mitfahren) === 1 && num(t.bezahlt) === 1)
            .reduce((s: number, t: any) =>
                s + (num(t.betrag) > 0 ? num(t.betrag) : beitrag), 0);
    } catch {
        return 0;
    }
}

/** GET /api/freizeit-ausgaben?freizeit=ID -> {ausgaben, perKategorie, summe, einnahmen, saldo, canEdit}. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const freizeit = url.searchParams.get('freizeit') || '';
    if (!freizeit) return json({ error: 'freizeit nötig' }, 400);
    try {
        const pb = await adminPb();
        await ensureFreizeitAusgaben(pb);
        const ausgaben = await pb.collection('freizeit_ausgaben').getFullList({
            filter: `freizeit="${freizeit}"`,
            sort: 'kategorie,created',
        });
        const perKategorie: Record<string, number> = {};
        let summe = 0;
        for (const a of ausgaben) {
            const k = (a.kategorie || 'Sonstiges').toString();
            perKategorie[k] = (perKategorie[k] || 0) + num(a.betrag);
            summe += num(a.betrag);
        }
        const einnahmen = await einnahmenOf(pb, freizeit);
        return json({
            ausgaben,
            perKategorie,
            summe,
            einnahmen,
            saldo: einnahmen - summe,
            canEdit: await isJugendLeitung(user),
        });
    } catch (e: any) {
        console.error('GET /api/freizeit-ausgaben failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};

/** POST /api/freizeit-ausgaben -> neue Ausgabe (nur Jugendleitung). */
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
        await ensureFreizeitAusgaben(pb);
        const rec = await pb.collection('freizeit_ausgaben').create(pick(body));
        return json({ ausgabe: rec });
    } catch (e: any) {
        console.error('POST /api/freizeit-ausgaben failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
