/**
 * GET /api/preachers-debug  (Diagnose)
 * Listet die Mitglieder (Prediger) aus PocketBase mit id, ct_id, name, role
 * und Anzahl erlaubter Dienste – um Duplikate aufzuspüren. Keine Secrets.
 */
import { json, preflight } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function GET() {
    try {
        const pb = await adminPb();
        const groups = await pb.collection('groups').getFullList();
        const gName: Record<string, string> = {};
        for (const g of groups) gName[g.id] = `${g.name} (ct ${g.ct_id})`;
        const members = await pb
            .collection('members')
            .getFullList({ sort: 'name' });
        const rows = members.map((m: any) => ({
            id: m.id,
            ct_id: m.ct_id ?? '',
            name: m.name,
            role: m.role ?? '',
            group: gName[m.group] ?? m.group,
            allowed: Array.isArray(m.allowed_services)
                ? m.allowed_services.length
                : 0,
        }));
        // Duplikate nach Name bzw. ct_id markieren.
        const nameCount: Record<string, number> = {};
        const ctCount: Record<string, number> = {};
        for (const r of rows) {
            nameCount[r.name] = (nameCount[r.name] || 0) + 1;
            if (r.ct_id) ctCount[r.ct_id] = (ctCount[r.ct_id] || 0) + 1;
        }
        const dupNames = Object.entries(nameCount)
            .filter(([, n]) => n > 1)
            .map(([k]) => k);
        const dupCts = Object.entries(ctCount)
            .filter(([, n]) => n > 1)
            .map(([k]) => k);
        return json({ count: rows.length, dupNames, dupCts, rows });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
