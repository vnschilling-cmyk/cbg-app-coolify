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
        return json({
            id: user.id,
            name: user.name || user.username || user.email || '',
            email: user.email || '',
            role,
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
