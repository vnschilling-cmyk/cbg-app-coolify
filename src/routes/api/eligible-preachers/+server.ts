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
        const people = rows
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
        return json({ people });
    } catch (e: any) {
        console.error('GET /api/eligible-preachers failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
