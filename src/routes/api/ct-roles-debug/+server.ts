/**
 * GET /api/ct-roles-debug  (temporär, zur Diagnose der Bruderrat-Rollen)
 * Zeigt, was ChurchTools für Gruppe/Rollen/Mitglieder liefert, damit das
 * Rollen-Mapping (Sondermitarbeiter) korrekt gebaut werden kann.
 */
import { json, preflight } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();
const isBruderrat = (s: string) => /bruder\s*-?\s*rat/i.test(s || '');

export async function GET() {
    const base = env.CHURCHTOOLS_BASE_URL;
    const token = env.CHURCHTOOLS_TOKEN;
    if (!base || !token) return json({ error: 'CT-Config fehlt' }, 400);
    const client = new ChurchToolsClient(base, token);
    const out: any = {};
    try {
        const gr: any = await client.request('groups?limit=200');
        const grp = (gr.data || []).find((x: any) => isBruderrat(x.name));
        out.group = grp
            ? {
                id: grp.id,
                name: grp.name,
                groupTypeId: grp.groupTypeId ?? grp.information?.groupTypeId,
                keys: Object.keys(grp),
              }
            : null;
        if (grp) {
            out.roleEndpoints = {};
            for (const ep of [
                'grouptyperoles?limit=200',
                'group/grouptyperoles?limit=200',
                'grouptypes',
                `groups/${grp.id}`,
            ]) {
                try {
                    const r: any = await client.request(ep);
                    out.roleEndpoints[ep] = JSON.stringify(r).slice(0, 800);
                } catch (e: any) {
                    out.roleEndpoints[ep] = `ERR: ${e?.message}`;
                }
            }
            const mem: any[] = await client.getGroupMembers(grp.id);
            out.members = (mem || []).map((m: any) => ({
                name: `${m.person?.firstName || ''} ${m.person?.lastName || ''}`
                    .trim(),
                personId: m.personId,
                groupTypeRoleId: m.groupTypeRoleId,
                keys: Object.keys(m),
            }));
        }
    } catch (e: any) {
        out.error = e?.message;
    }
    return json(out);
}
