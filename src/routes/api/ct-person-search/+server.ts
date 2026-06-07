/**
 * GET /api/ct-person-search?q=...
 * Sucht Personen in ChurchTools (für „Gast hinzufügen"). Liefert
 * [{ name, id }] (id = CT-Personen-ID, Avatar via /api/person-image/{id}).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

// `/search` liefert je Treffer `title` (voller Name) und die Felder unter
// `domainAttributes`; als Fallback der direkte Personen-Datensatz.
const fullName = (p: any) => {
    const a = p?.domainAttributes ?? p ?? {};
    return (
        (p?.title || '').toString().trim() ||
        `${a.firstName || ''} ${a.lastName || ''}`.trim()
    );
};

export async function GET({ request, url }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ persons: [] });

    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = user?.ct_api_key || env.CHURCHTOOLS_TOKEN;
        if (!base || !token) return json({ persons: [] });
        const client = new ChurchToolsClient(base, token);
        const hits = await client.searchPersons(q, 25);
        const persons = hits
            .filter((p: any) => !p?.domainAttributes?.isArchived)
            .map((p: any) => ({
                name: fullName(p),
                id: (p.domainIdentifier ?? p.id) != null
                    ? String(p.domainIdentifier ?? p.id)
                    : null,
            }))
            .filter((p: any) => p.name && p.id);
        return json({ persons });
    } catch (e: any) {
        console.error('ct-person-search failed', e?.message || e);
        return json({ persons: [] });
    }
}
