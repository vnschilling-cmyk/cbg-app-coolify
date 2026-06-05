/**
 * GET /api/me – liefert die effektive Rolle + Rechte des angemeldeten Nutzers.
 * Wird von der Flutter-App zum Ein-/Ausblenden von Menüs/Einstellungen genutzt.
 * Stellt nebenbei sicher, dass die `app_config`-Collection existiert.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureAppConfig,
    getConfig,
    effectiveRole,
    permsForRole,
} from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    try {
        const pb = await adminPb();
        await ensureAppConfig(pb);
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        const rolePerms = (await getConfig(pb, 'role_perms')) || {};
        const role = effectiveRole(user.id, user.role, roleMap);

        // CT-Personen-ID für den Avatar: zuerst schneller Namens-Treffer in
        // `members`, sonst robust über ChurchTools (Namenssuche + E-Mail-Abgleich).
        let personId: string | null = null;
        const nm = (user.name || '').toString().trim();
        try {
            if (nm) {
                const m = await pb
                    .collection('members')
                    .getFirstListItem(`name="${nm}"`);
                if (m?.ct_id) personId = String(m.ct_id);
            }
        } catch (_) {
            // kein PB-Treffer -> CT-Suche unten
        }
        if (!personId && nm) {
            try {
                const base = env.CHURCHTOOLS_BASE_URL;
                const token = env.CHURCHTOOLS_TOKEN;
                if (base && token) {
                    const client = new ChurchToolsClient(base, token);
                    const r: any = await client.request(
                        `persons?query=${encodeURIComponent(nm)}&limit=25`);
                    const list: any[] = r.data || [];
                    const email = (user.email || '').toString().toLowerCase();
                    let hit = email
                        ? list.find((p) =>
                            (p.email || '').toString().toLowerCase() === email)
                        : null;
                    hit ??= list.find((p) =>
                        `${p.firstName || ''} ${p.lastName || ''}`.trim()
                            .toLowerCase() === nm.toLowerCase());
                    if (!hit && list.length === 1) hit = list[0];
                    if (hit) personId = String(hit.id ?? hit.domainIdentifier);
                }
            } catch (_) {
                // Avatar fällt auf Initialen zurück
            }
        }

        return json({
            id: user.id,
            name: user.name || user.username || user.email || '',
            email: user.email || '',
            role,
            personId,
            perms: permsForRole(role, rolePerms),
        });
    } catch (e: any) {
        // Fallback: ohne Backend-Admin keine Einschränkung (kein Lockout).
        console.error('GET /api/me failed:', e?.message || e);
        return json({
            id: user.id,
            name: user.name || user.email || '',
            email: user.email || '',
            role: user.role === 'admin' ? 'admin' : 'prediger',
            perms: null,
            degraded: true,
        });
    }
}
