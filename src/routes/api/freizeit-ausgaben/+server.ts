import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureFreizeitAusgaben, ensureFreizeitTeilnehmer,
    ensureFreizeiten, ensureUnterkuenfte, isJugendLeitung,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const FIELDS = ['freizeit', 'kategorie', 'bezeichnung', 'betrag', 'datum',
    'sort_order', 'status', 'bestellnummer', 'lieferant',
    'beleg_b64', 'beleg_name', 'beleg_typ'];

function pick(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
    return out;
}

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
const norm = (v: any) => (v ?? '').toString().trim().toLowerCase();
/** Leerer/unbekannter Status zählt als „bezahlt" (Altdaten ohne Status). */
const statusOf = (a: any) => norm(a.status) || 'bezahlt';

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

/** Nächte zwischen zwei yyyy-MM-dd-Datumsangaben (>= 0). */
function nightsBetween(von: any, bis: any): number {
    const p = (s: any) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((s ?? '').toString());
        return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
    };
    const a = p(von), b = p(bis);
    if (a == null || b == null) return 0;
    const d = Math.round((b - a) / 86400000);
    return d > 0 ? d : 0;
}

/**
 * Berechnet die Unterkunftskosten einer Freizeit automatisch aus den
 * Preisfeldern der verknüpften Unterkunft, Nächten (von/bis) und Mitfahrern.
 * Kaution zählt NICHT (rückerstattbar). Liefert Betrag + Aufschlüsselung.
 */
async function unterkunftKostenOf(pb: any, freizeit: string) {
    const empty = { betrag: 0, naechte: 0, personen: 0, breakdown: [] as any[] };
    let fz: any;
    try {
        await ensureFreizeiten(pb);
        fz = await pb.collection('freizeiten').getOne(freizeit);
    } catch { return empty; }
    const ukId = (fz.unterkunft ?? '').toString();
    if (!ukId) return empty;
    let uk: any;
    try {
        await ensureUnterkuenfte(pb);
        uk = await pb.collection('unterkuenfte').getOne(ukId);
    } catch { return empty; }

    const naechte = nightsBetween(fz.von, fz.bis);
    let personen = 0;
    try {
        await ensureFreizeitTeilnehmer(pb);
        const tn = await pb.collection('freizeit_teilnehmer').getFullList({
            filter: `freizeit="${freizeit}"`,
        });
        personen = tn.filter((t: any) => num(t.mitfahren) === 1).length;
    } catch { /* personen = 0 */ }

    const grund = num(uk.grundpreis);
    const proNacht = num(uk.preis_pro_nacht);
    const proPerson = num(uk.preis_pro_person);
    const einheit = (uk.preis_pro_person_einheit ?? '').toString().toLowerCase();
    const proNachtPerson = einheit.includes('nacht');
    const personFaktor = proNachtPerson ? personen * naechte : personen;

    const breakdown: { label: string; betrag: number }[] = [];
    if (grund > 0) breakdown.push({ label: 'Grundpreis', betrag: grund });
    if (proNacht > 0 && naechte > 0) {
        breakdown.push({
            label: `${naechte} Nächte × ${proNacht.toFixed(2)} €`,
            betrag: proNacht * naechte,
        });
    }
    if (proPerson > 0 && personFaktor > 0) {
        breakdown.push({
            label: `${personen} Personen${proNachtPerson ? ` × ${naechte} Nächte` : ''}`
                + ` × ${proPerson.toFixed(2)} €`,
            betrag: proPerson * personFaktor,
        });
    }
    // Nebenkosten: json-Liste [{ bezeichnung, betrag }] oder Zahlen.
    let neben = uk.nebenkosten;
    if (typeof neben === 'string') { try { neben = JSON.parse(neben); } catch { neben = null; } }
    if (Array.isArray(neben)) {
        for (const n of neben) {
            const b = num(n?.betrag ?? n);
            if (b > 0) {
                breakdown.push({
                    label: (n?.bezeichnung ?? 'Nebenkosten').toString(),
                    betrag: b,
                });
            }
        }
    }
    const betrag = breakdown.reduce((s, x) => s + num(x.betrag), 0);
    return { betrag, naechte, personen, breakdown };
}

/**
 * Abgleich Bestellung↔Rechnung: Eine „bestellt"-Position gilt als gedeckt,
 * wenn ihre Bestellnummer einer „offen/bezahlt"-Position entspricht
 * (→ nicht doppelt zählen). Schwacher Treffer (gleicher Lieferant + Betrag,
 * keine Bestellnummer) ⇒ Duplikatverdacht (nur Hinweis).
 */
function reconcile(ausgaben: any[]) {
    const covered = new Set<string>();
    const orders = ausgaben.filter((a) => statusOf(a) === 'bestellt');
    const invoices = ausgaben.filter((a) => statusOf(a) !== 'bestellt');
    for (const o of orders) {
        const bn = norm(o.bestellnummer);
        if (bn && invoices.some((i) => norm(i.bestellnummer) === bn)) {
            covered.add(o.id);
        }
    }
    const dup: { a: string; b: string; lieferant: string; betrag: number }[] = [];
    for (let i = 0; i < invoices.length; i++) {
        for (let j = i + 1; j < invoices.length; j++) {
            const a = invoices[i], b = invoices[j];
            if (norm(a.bestellnummer) || norm(b.bestellnummer)) continue;
            if (!norm(a.lieferant) || norm(a.lieferant) !== norm(b.lieferant)) continue;
            const av = num(a.betrag), bv = num(b.betrag);
            if (av <= 0) continue;
            if (Math.abs(av - bv) <= Math.max(1, av * 0.005)) {
                dup.push({ a: a.id, b: b.id, lieferant: (a.lieferant ?? '').toString(), betrag: av });
            }
        }
    }
    return { covered, dup };
}

/** GET /api/freizeit-ausgaben?freizeit=ID -> Controlling-Übersicht (v2). */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    const freizeit = url.searchParams.get('freizeit') || '';
    if (!freizeit) return json({ error: 'freizeit nötig' }, 400);
    let step = 'start';
    try {
        step = 'adminPb';
        const pb = await adminPb();
        step = 'ensure';
        await ensureFreizeitAusgaben(pb);
        step = 'getFullList';
        const ausgaben = await pb.collection('freizeit_ausgaben').getFullList({
            filter: `freizeit="${freizeit}"`,
            sort: 'kategorie,created',
        });
        step = 'compute';

        const { covered, dup } = reconcile(ausgaben);
        const perKategorie: Record<string, number> = {};
        let bestellt = 0, offen = 0, bezahlt = 0;
        for (const a of ausgaben) {
            const b = num(a.betrag);
            const s = statusOf(a);
            if (s === 'bestellt') {
                if (!covered.has(a.id)) bestellt += b; // gedeckte nicht zählen
                continue;
            }
            if (s === 'offen') offen += b; else bezahlt += b;
            const k = (a.kategorie || 'Sonstiges').toString();
            perKategorie[k] = (perKategorie[k] || 0) + b;
        }

        // Berechnete Unterkunft zählt nur in die Bilanz, solange KEINE echte
        // „Unterkunft"-Rechnung erfasst ist (sonst Doppelzählung). Mit erfasster
        // Rechnung gilt diese als Ist, die Berechnung nur noch als Kalkulation.
        const hatManuelleUnterkunft = ausgaben.some((a) =>
            statusOf(a) !== 'bestellt' &&
            (a.kategorie || '').toString() === 'Unterkunft');
        step = 'unterkunft';
        const unterkunft: any = await unterkunftKostenOf(pb, freizeit);
        unterkunft.inBilanz = unterkunft.betrag > 0 && !hatManuelleUnterkunft;
        if (unterkunft.inBilanz) {
            perKategorie['Unterkunft'] =
                (perKategorie['Unterkunft'] || 0) + unterkunft.betrag;
        }

        // Soll-Budget aus freizeiten.budget_plan.
        let budget: Record<string, number> = {};
        try {
            const fz = await pb.collection('freizeiten').getOne(freizeit);
            let bp: any = fz.budget_plan;
            if (typeof bp === 'string') { try { bp = JSON.parse(bp); } catch { bp = null; } }
            if (bp && typeof bp === 'object' && !Array.isArray(bp)) {
                for (const [k, v] of Object.entries(bp)) budget[k] = num(v);
            }
        } catch { /* kein Budget */ }

        step = 'einnahmen';
        const einnahmen = await einnahmenOf(pb, freizeit);
        const gesamtkosten = offen + bezahlt + bestellt +
            (unterkunft.inBilanz ? unterkunft.betrag : 0);
        step = 'jugendleitung';
        const canEdit = await isJugendLeitung(user);
        step = 'response';

        // Liste ohne beleg_b64 (Performance); Flag, ob ein Beleg vorhanden ist.
        const list = ausgaben.map((a: any) => {
            const { beleg_b64, ...rest } = a;
            return {
                ...rest,
                hat_beleg: !!((a.beleg_name ?? '').toString() || (beleg_b64 ?? '').toString()),
            };
        });

        return json({
            ausgaben: list,
            perKategorie,
            unterkunft,
            budget,
            kpis: { bestellt, offen, bezahlt },
            duplikatVerdacht: dup,
            einnahmen,
            summe: gesamtkosten, // Rückwärtskompat (frühere Bedeutung: Ausgaben gesamt)
            gesamtkosten,
            saldo: einnahmen - gesamtkosten,
            canEdit,
        });
    } catch (e: any) {
        console.error('GET /api/freizeit-ausgaben failed:', step, e?.message || e,
            e?.status, JSON.stringify(e?.data || e?.response || {}));
        // DIAGNOSE (temporär): Schritt + PB-Detail mitsenden.
        return json({
            error: e?.message || 'Fehler',
            step,
            status: e?.status,
            data: e?.data ?? e?.response ?? null,
            where: (e?.stack || '').split('\n').slice(0, 4),
        }, 500);
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
