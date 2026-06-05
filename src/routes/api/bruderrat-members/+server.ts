/**
 * GET /api/bruderrat-members
 * Liefert die Bruderratsmitglieder als [{ name, id, role }] (id = CT-Personen-ID
 * für den Avatar; role = 'leiter' | 'mitglied' | 'sonder').
 *
 * Quelle: LIVE aus ChurchTools-Gruppe „Bruderrat" (immer aktuell, inkl. Rolle).
 * Fällt nur bei CT-Fehler auf die PocketBase-Gruppe zurück (ohne Rolle).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

const isBruderrat = (s: string) => /bruder\s*-?\s*rat/i.test(s || '');

/** Rollen-Bezeichnung -> Kategorie. */
function classifyRole(roleName: string): 'leiter' | 'mitglied' | 'sonder' {
    const r = (roleName || '').toLowerCase();
    if (r.includes('leiter')) return 'leiter';
    if (r.includes('sonder')) return 'sonder';
    return 'mitglied';
}

/** roleId -> Rollenname (aus Gruppe bzw. Grouptypes). */
async function loadRoleNames(
    client: ChurchToolsClient,
    grp: any,
): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
        const g: any = await client.request(`groups/${grp.id}`);
        const gg = g.data || g;
        const roles = gg.roles || gg.information?.roles;
        if (Array.isArray(roles)) {
            for (const r of roles) {
                if (r?.id != null) map.set(r.id, r.name || r.nameTranslated || '');
            }
        }
    } catch { /* weiter */ }
    if (map.size === 0) {
        try {
            const gt: any = await client.request('grouptypes');
            for (const t of (gt.data || [])) {
                for (const r of (t.roles || [])) {
                    if (r?.id != null) {
                        map.set(r.id, r.name || r.nameTranslated || '');
                    }
                }
            }
        } catch { /* ignore */ }
    }
    return map;
}

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let members: { name: string; id: string | null; role: string }[] = [];

    // 1) LIVE aus ChurchTools (Quelle der Wahrheit, inkl. Rolle).
    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = user?.ct_api_key || env.CHURCHTOOLS_TOKEN;
        if (base && token) {
            const client = new ChurchToolsClient(base, token);
            const gr: any = await client.request('groups?limit=200');
            const grp = (gr.data || []).find((x: any) => isBruderrat(x.name));
            if (grp) {
                const roleNames = await loadRoleNames(client, grp);
                const mem = await client.getGroupMembers(grp.id);
                for (const m of mem) {
                    const pid = m.personId != null ? String(m.personId) : null;
                    let name =
                        `${m.person?.firstName || ''} ${m.person?.lastName || ''}`
                            .trim();
                    if (!name && m.personId) {
                        try {
                            const pr: any =
                                await client.request(`persons/${m.personId}`);
                            const p = pr.data || pr;
                            name = `${p.firstName || ''} ${p.lastName || ''}`
                                .trim();
                        } catch { /* ignore */ }
                    }
                    if (!name) continue;
                    const role = classifyRole(
                        roleNames.get(m.groupTypeRoleId) || '');
                    members.push({ name, id: pid, role });
                }
                members.sort((a, b) => a.name.localeCompare(b.name));
            }
        }
    } catch (e: any) {
        console.error('bruderrat-members CT failed', e?.message || e);
    }

    // 2) Fallback: PocketBase-Gruppe „Bruderrat" (ohne Rolle), falls CT scheitert.
    if (!members.length) {
        try {
            const pb = await adminPb();
            const groups = await pb.collection('groups').getFullList();
            const g = groups.find((x: any) => isBruderrat(x.name));
            if (g) {
                const recs = await pb.collection('members').getFullList({
                    filter: `group="${g.id}"`,
                    sort: 'name',
                });
                members = recs
                    .map((r: any) => ({
                        name: (r.name || '').toString(),
                        id: r.ct_id ? String(r.ct_id) : null,
                        role: 'mitglied',
                    }))
                    .filter((m) => m.name);
            }
        } catch (e: any) {
            console.error('bruderrat-members PB failed', e?.message || e);
        }
    }

    return json({ members });
}
