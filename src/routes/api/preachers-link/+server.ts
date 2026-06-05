/**
 * POST /api/preachers-link?confirm=link   (einmalig)
 * Verknüpft Prediger-Datensätze ohne ct_id mit ihrer ChurchTools-Person
 * (für Fotos/Export): „Viktor Enns (Jun.)" -> 19, alle übrigen ohne ct_id
 * per exaktem Namens-Match aus ChurchTools. Wird danach entfernt.
 */
import { json, preflight } from '$lib/server/api';
import { adminPb } from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import {
    CHURCHTOOLS_TOKEN,
    CHURCHTOOLS_BASE_URL,
    PREACHER_GROUP_ID,
} from '$env/static/private';

export const OPTIONS = async () => preflight();

export async function POST({ url }) {
    if (url.searchParams.get('confirm') !== 'link') {
        return json({ error: 'confirm fehlt' }, 400);
    }
    try {
        const pb = await adminPb();
        const client = new ChurchToolsClient(
            CHURCHTOOLS_BASE_URL,
            CHURCHTOOLS_TOKEN,
        );
        const prediger = await pb
            .collection('groups')
            .getFirstListItem(`ct_id="${PREACHER_GROUP_ID}"`);
        const members = await pb
            .collection('members')
            .getFullList({ filter: `group="${prediger.id}"` });

        const done: string[] = [];
        const unresolved: string[] = [];

        for (const m of members) {
            if (m.ct_id) continue; // schon verknüpft
            // Explizit: Viktor Enns (Jun.) -> 19
            if (m.name === 'Viktor Enns (Jun.)') {
                await pb.collection('members').update(m.id, { ct_id: '19' });
                done.push(`${m.name} -> 19`);
                continue;
            }
            // Sonst per exaktem Namen in ChurchTools suchen.
            try {
                const res: any = await client.request(
                    `persons?query=${encodeURIComponent(m.name)}`,
                );
                const persons: any[] = res?.data || [];
                const matches = persons.filter((p: any) => {
                    const fn =
                        p.firstName ?? p.domainAttributes?.firstName ?? '';
                    const ln = p.lastName ?? p.domainAttributes?.lastName ?? '';
                    const full = `${fn} ${ln}`.trim().toLowerCase();
                    const title = (p.title || '').toString().trim().toLowerCase();
                    return (
                        full === m.name.trim().toLowerCase() ||
                        title === m.name.trim().toLowerCase()
                    );
                });
                if (matches.length === 1) {
                    await pb
                        .collection('members')
                        .update(m.id, { ct_id: String(matches[0].id) });
                    done.push(`${m.name} -> ${matches[0].id}`);
                } else {
                    unresolved.push(`${m.name} (${matches.length} Treffer)`);
                }
            } catch (e: any) {
                unresolved.push(`${m.name} (Fehler: ${e?.message || e})`);
            }
        }
        return json({ ok: true, done, unresolved });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
