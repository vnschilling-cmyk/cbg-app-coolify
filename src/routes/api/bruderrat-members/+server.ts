/**
 * GET /api/bruderrat-members
 * Liefert die Bruderratsmitglieder als [{ name, id }] (id = CT-Personen-ID
 * für den Avatar über /api/person-image/{id}).
 *
 * Quelle: PocketBase-Gruppe „Bruderrat" (synchronisiert). Fällt auf die
 * ChurchTools-Gruppe gleichen Namens zurück, falls in PB (noch) nicht vorhanden.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

const isBruderrat = (s: string) => /bruder\s*-?\s*rat/i.test(s || '');

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let members: { name: string; id: string | null }[] = [];

    // 1) PocketBase-Gruppe „Bruderrat".
    try {
        const pb = await adminPb();
        const groups = await pb.collection('groups').getFullList();
        const g = groups.find((x: any) => isBruderrat(x.name));
        if (g) {
            const recs = await pb.collection('members').getFullList({
                filter: `group="${g.id}"`,
                sort: 'name',
            });
            members = recs.map((r: any) => ({
                name: (r.name || '').toString(),
                id: r.ct_id ? String(r.ct_id) : null,
            })).filter((m) => m.name);
        }
    } catch (e: any) {
        console.error('bruderrat-members PB failed', e?.message || e);
    }

    // 2) Fallback: ChurchTools-Gruppe „Bruderrat".
    if (!members.length) {
        try {
            const base = env.CHURCHTOOLS_BASE_URL;
            const token = env.CHURCHTOOLS_TOKEN;
            if (base && token) {
                const client = new ChurchToolsClient(base, token);
                const gr = await client.request('groups?limit=200');
                const grp = (gr.data || []).find((x: any) => isBruderrat(x.name));
                if (grp) {
                    const mem = await client.getGroupMembers(grp.id);
                    members = mem
                        .map((m: any) => {
                            const p = m.person || m;
                            const name =
                                `${p.firstName || ''} ${p.lastName || ''}`.trim();
                            return {
                                name,
                                id: m.personId != null ? String(m.personId) : null,
                            };
                        })
                        .filter((m: any) => m.name);
                    members.sort((a, b) => a.name.localeCompare(b.name));
                }
            }
        } catch (e: any) {
            console.error('bruderrat-members CT failed', e?.message || e);
        }
    }

    return json({ members });
}
