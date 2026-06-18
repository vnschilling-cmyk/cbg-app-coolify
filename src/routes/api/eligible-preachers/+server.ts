/**
 * GET /api/eligible-preachers?serviceId=1
 * Liefert die für einen vom Plan verwalteten Dienst BERECHTIGTEN Prediger als
 * { people: [{ name, id }] } (id = CT-Personen-ID). Berechtigung = die
 * `allowed_services` (Plan-Codes) des Mitglieds schneiden die Codes, die auf
 * diese serviceId abbilden (Umkehrung von serviceIdForCode in editor-core.ts).
 * Für Gemeindestunde-Dienste nutzt die App stattdessen /api/bruderrat-members.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

/** serviceId → qualifizierende Plan-Codes (ein Mitglied gilt als berechtigt,
 *  wenn seine allowed_services einen dieser Codes enthalten). */
const CODES_FOR_SERVICE: Record<number, string[]> = {
    1: ['1', '2', 'BN', 'Als'], // Predigt
    3: ['L', '🍷'], // Leitung
    61: ['V'], // Verteiler
    88: ['Anf'], // Einleitung / Anfang
    91: ['BS', 'Als'], // Leitung BS
    94: ['GS'], // Leitung GS
    117: ['Schl'], // Abschluss
};

export async function GET({ request, url }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const serviceId = Number(url.searchParams.get('serviceId') || '0');
    const codes = CODES_FOR_SERVICE[serviceId] || [];

    try {
        const pb = await adminPb();
        const rows = await pb.collection('members').getFullList({ sort: 'name' });
        const mapped = rows
            .filter((m: any) => {
                const allowed = Array.isArray(m.allowed_services)
                    ? m.allowed_services.map((c: any) => String(c))
                    : [];
                // Ohne bekannte Codes (unerwartete serviceId) keine Einschränkung.
                return codes.length === 0
                    ? true
                    : allowed.some((c: string) => codes.includes(c));
            })
            .map((m: any) => ({
                name: (m.name || '').toString(),
                id: String(m.ct_id || ''),
            }))
            .filter((p: any) => p.name);

        // Entdoppeln: dieselbe Person darf nur einmal erscheinen.
        // - gleiche ct_id (z. B. Mitglied in mehreren Gruppen) -> einmal
        // - Eintrag MIT ct_id (Foto) gewinnt; ein id-loser Datensatz desselben
        //   Namens (Altbestand/fehlende ct_id) entfällt dann.
        // - zwei verschiedene Personen mit gleichem Namen (verschiedene ct_id)
        //   bleiben beide erhalten.
        const normName = (s: string) =>
            s.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        const seenIds = new Set<string>();
        const namesWithId = new Set<string>();
        const people: { name: string; id: string }[] = [];
        for (const p of mapped) {
            if (!p.id) continue;
            if (seenIds.has(p.id)) continue;
            seenIds.add(p.id);
            namesWithId.add(normName(p.name));
            people.push(p);
        }
        const seenNoIdNames = new Set<string>();
        for (const p of mapped) {
            if (p.id) continue;
            const nk = normName(p.name);
            if (namesWithId.has(nk) || seenNoIdNames.has(nk)) continue;
            seenNoIdNames.add(nk);
            people.push(p);
        }
        people.sort((a, b) => a.name.localeCompare(b.name, 'de'));
        return json({ people });
    } catch (e: any) {
        console.error('GET /api/eligible-preachers failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
