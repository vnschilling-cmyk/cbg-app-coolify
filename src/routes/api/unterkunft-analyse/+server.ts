/**
 * KI-Analyse einer Unterkunft: liest die angehängten PDF-Dokumente und schlägt
 * Haus-Stammdaten + Kosten vor (Vermittler wie „Donell" werden abgegrenzt).
 *
 *   POST /api/unterkunft-analyse  { unterkunft }
 *     -> { vorschlag: {<feld>: <wert>}, vermittler: {name,telefon,email},
 *          nebenkosten: [{bezeichnung,betrag,einheit}], hinweis }
 */
import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureUnterkunftDokumente, geminiAnalyzeUnterkunft,
    getLlmConfig, isJugendLeitung,
} from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

const MAX_TOTAL = 18_000_000; // ~18 MB Inline-Limit der Gemini-Anfrage

const str = (v: any) => (v ?? '').toString().trim();
const num = (v: any) => {
    const n = typeof v === 'number' ? v : parseFloat(`${v}`.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

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
    const unterkunft = str(body?.unterkunft);
    if (!unterkunft) return json({ error: 'unterkunft nötig' }, 400);

    try {
        const pb = await adminPb();
        const llm = await getLlmConfig(pb);
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);

        await ensureUnterkunftDokumente(pb);
        const docs = await pb.collection('unterkunft_dokumente').getFullList({
            filter: `unterkunft="${unterkunft}"`,
            sort: 'sort_order,created',
        });
        if (!docs.length) {
            return json({ error: 'Keine PDF-Dokumente vorhanden.' }, 422);
        }

        // PDFs als inlineData-Parts (bis zum Größenlimit).
        const parts: any[] = [];
        let total = 0;
        let skipped = 0;
        for (const d of docs) {
            const b64 = (d.pdf_b64 ?? '').toString();
            if (!b64) continue;
            if (total + b64.length > MAX_TOTAL) {
                skipped++;
                continue;
            }
            total += b64.length;
            parts.push({ inlineData: { mimeType: 'application/pdf', data: b64 } });
        }
        if (!parts.length) {
            return json({ error: 'Dokumente zu groß für die Analyse.' }, 422);
        }

        const r = await geminiAnalyzeUnterkunft(parts, llm.key);
        const h = r.haus ?? {};
        const k = r.kosten ?? {};

        // Flacher Vorschlag, Schlüssel = Unterkunft-Feldnamen.
        const vorschlag: Record<string, unknown> = {};
        const setS = (key: string, v: any) => {
            const s = str(v);
            if (s) vorschlag[key] = s;
        };
        const setN = (key: string, v: any) => {
            const n = num(v);
            if (n > 0) vorschlag[key] = n;
        };
        setS('name', h.name);
        setS('strasse', h.strasse);
        setS('plz', h.plz);
        setS('ort', h.ort);
        setS('land', h.land);
        setS('website', h.website);
        setS('kontakt_name', h.kontakt_name);
        setS('kontakt_telefon', h.kontakt_telefon);
        setS('kontakt_email', h.kontakt_email);
        setS('beschreibung', h.beschreibung);
        setN('kapazitaet', h.kapazitaet);
        setS('waehrung', k.waehrung);
        setS('preis_pro_person_einheit', k.preis_pro_person_einheit);
        setS('kosten_notiz', k.kosten_notiz);
        setN('grundpreis', k.grundpreis);
        setN('preis_pro_nacht', k.preis_pro_nacht);
        setN('preis_pro_person', k.preis_pro_person);
        setN('anzahlung', k.anzahlung);
        setN('kaution', k.kaution);

        const nebenkosten = (Array.isArray(k.nebenkosten) ? k.nebenkosten : [])
            .map((n: any) => ({
                bezeichnung: str(n?.bezeichnung),
                betrag: num(n?.betrag),
                einheit: str(n?.einheit),
            }))
            .filter((n: any) => n.bezeichnung || n.betrag > 0);

        const vm = r.vermittler ?? {};
        const vermittler = {
            name: str(vm.name),
            telefon: str(vm.telefon),
            email: str(vm.email),
        };

        return json({
            vorschlag,
            nebenkosten,
            vermittler,
            hinweis: skipped > 0
                ? `${skipped} Dokument(e) wurden wegen Größe nicht analysiert.`
                : '',
        });
    } catch (e: any) {
        console.error('POST /api/unterkunft-analyse failed:', e?.message || e);
        return json({ error: e?.message || 'Analyse fehlgeschlagen' }, 500);
    }
};
