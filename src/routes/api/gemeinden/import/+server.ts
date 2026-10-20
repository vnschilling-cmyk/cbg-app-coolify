import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, ensureGemeinden } from '$lib/server/admin';
import { gemeindenAccess } from '$lib/server/gemeinden';

export const OPTIONS: RequestHandler = async () => preflight();

const str = (v: unknown) => (v ?? '').toString().trim();
const keyOf = (name: string, plz: string, strasse: string) =>
    `${name}|${plz}|${strasse}`.toLowerCase().replace(/\s+/g, ' ');

/**
 * POST /api/gemeinden/import -> Zeilen aus der Gemeindeliste übernehmen.
 * Body { rows: [{name, bund, strasse, plz, ort, bundesland}] }. Bereits
 * vorhandene Einträge (Name + PLZ + Straße) werden übersprungen. Standorte
 * ermittelt danach /api/gemeinden/geocode schrittweise.
 */
export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if ((await gemeindenAccess(user)) !== 'bearbeiten') {
        return json({ error: 'Keine Berechtigung' }, 403);
    }
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    const rows: any[] = Array.isArray(body?.rows) ? body.rows.slice(0, 5000) : [];
    if (!rows.length) return json({ error: 'Keine Zeilen' }, 400);

    // Schreibvarianten eines Bundes vereinheitlichen (z. B. „btg" -> „BTG"):
    // die häufigste Schreibweise gewinnt.
    const counts = new Map<string, Map<string, number>>();
    for (const r of rows) {
        const b = str(r.bund);
        if (!b) continue;
        const m = counts.get(b.toLowerCase()) ?? new Map<string, number>();
        m.set(b, (m.get(b) ?? 0) + 1);
        counts.set(b.toLowerCase(), m);
    }
    const canonical = (b: string) => {
        const m = counts.get(b.toLowerCase());
        if (!m) return b;
        return [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
    };

    try {
        const pb = await adminPb();
        await ensureGemeinden(pb);
        const existing = await pb.collection('gemeinden').getFullList({
            fields: 'id,name,plz,strasse',
        });
        const seen = new Set(existing.map((e: any) =>
            keyOf(str(e.name), str(e.plz), str(e.strasse))));
        let created = 0;
        let skipped = 0;
        for (const r of rows) {
            const name = str(r.name);
            if (!name) { skipped++; continue; }
            const plz = str(r.plz);
            const strasse = str(r.strasse);
            const k = keyOf(name, plz, strasse);
            if (seen.has(k)) { skipped++; continue; }
            seen.add(k);
            await pb.collection('gemeinden').create({
                name,
                bund: canonical(str(r.bund)),
                strasse,
                plz: /^\d{4}$/.test(plz) ? `0${plz}` : plz,
                ort: str(r.ort),
                bundesland: str(r.bundesland),
                geo_status: '',
                kontakte: [],
                kinder: {},
                jugend: {},
            });
            created++;
        }
        return json({ created, skipped });
    } catch (e: any) {
        console.error('POST /api/gemeinden/import failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
