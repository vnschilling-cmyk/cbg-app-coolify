/**
 * GET /api/ct-person-search?q=...
 * Sucht Personen in ChurchTools (für „Gast hinzufügen"). Liefert
 * [{ name, id }] (id = CT-Personen-ID, Avatar via /api/person-image/{id}).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

const fullName = (p: any) =>
    (`${p?.firstName || ''} ${p?.lastName || ''}`.trim()) ||
    (p?.title || '').toString();

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
        const r: any = await client.request(
            `persons?query=${encodeURIComponent(q)}&limit=25`);
        const persons = (r.data || [])
            .map((p: any) => ({
                name: fullName(p),
                id: (p.id ?? p.domainIdentifier) != null
                    ? String(p.id ?? p.domainIdentifier)
                    : null,
            }))
            .filter((p: any) => p.name && p.id);
        return json({ persons });
    } catch (e: any) {
        console.error('ct-person-search failed', e?.message || e);
        return json({ persons: [] });
    }
}
