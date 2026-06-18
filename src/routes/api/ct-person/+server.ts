/**
 * GET /api/ct-person?id=...
 * Liefert Name + E-Mail einer ChurchTools-Person (für die Benutzer-Anlage).
 * Nur für effektive Admins (E-Mail ist PII).
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureAppConfig, getConfig, effectiveRole,
} from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET({ request, url }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Admin-Gate (E-Mail ist personenbezogen).
    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        if (effectiveRole(user.id, user.role, roleMap) !== 'admin') {
            return json({ error: 'Forbidden' }, 403);
        }
    } catch {
        return json({ error: 'Forbidden' }, 403);
    }

    const id = (url.searchParams.get('id') || '').trim();
    if (!id) return json({ error: 'id nötig' }, 400);

    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = user?.ct_api_key || env.CHURCHTOOLS_TOKEN;
        if (!base || !token) {
            return json({ error: 'ChurchTools ist nicht konfiguriert' }, 500);
        }
        const client = new ChurchToolsClient(base, token);
        const r: any = await client.request(`persons/${id}`);
        const p = r?.data || r;
        const name = `${p?.firstName || ''} ${p?.lastName || ''}`.trim() ||
            (p?.title || '').toString();
        const email = (
            p?.email ||
            (Array.isArray(p?.emails)
                ? (p.emails.find((e: any) => e?.isDefault)?.email ||
                    p.emails[0]?.email)
                : '') ||
            ''
        ).toString().trim();
        return json({ name, email });
    } catch (e: any) {
        console.error('ct-person failed', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
}
