/**
 * Rechteverwaltung (nur für effektive Admins):
 *   GET  /api/users  -> { users:[{id,name,email,role}], rolePerms, defaults, menuKeys }
 *   POST /api/users  -> { userId, role }  ODER  { rolePerms }
 *
 * Nutzer werden mit Admin-Rechten gelesen (users-Collection ist sonst
 * PII-geschützt). Rollen-Zuweisung + Rechte-Matrix liegen in `app_config`.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureAppConfig,
    getConfig,
    setConfig,
    effectiveRole,
    DEFAULT_ROLE_PERMS,
    MENU_KEYS,
    type AppRole,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

async function requireAdmin(request: Request) {
    const { user } = await pbFromRequest(request);
    if (!user) return { error: json({ error: 'Unauthorized' }, 401) };
    const pb = await adminPb();
    try { await ensureAppConfig(pb); } catch (e: any) {
        console.error('ensureAppConfig (users):', e?.message || e);
    }
    const roleMap = (await getConfig(pb, 'user_roles')) || {};
    const role = effectiveRole(user.id, user.role, roleMap);
    if (role !== 'admin') return { error: json({ error: 'Forbidden' }, 403) };
    return { pb, roleMap, user };
}

export async function GET({ request }) {
    const ctx = await requireAdmin(request);
    if ('error' in ctx) return ctx.error;
    const { pb, roleMap, user } = ctx;

    try {
        const list = await pb.collection('users').getFullList({ sort: 'name' });

        // Nur Nutzer der konfigurierten Gruppen zeigen. Quelle: members-Collection
        // (bildet nach dem Sync die echte Gruppen-Mitgliedschaft ab). Abgleich
        // über den Namen (Suffixe wie „(Jun.)"/„(123)" entfernt). Der aktuelle
        // Nutzer ist immer dabei.
        const norm = (s: string) =>
            (s || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
        let memberNames = new Set<string>();
        try {
            const members = await pb.collection('members').getFullList();
            memberNames = new Set(members.map((m: any) => norm(m.name)));
        } catch { /* ignore */ }

        const filtered = memberNames.size === 0
            ? list // kein Mitgliederabgleich möglich -> alle zeigen
            : list.filter((u: any) =>
                memberNames.has(norm(u.name)) || u.id === user.id);

        const users = filtered.map((u: any) => ({
            id: u.id,
            name: u.name || u.username || u.email || '',
            email: u.email || '',
            role: effectiveRole(u.id, u.role, roleMap),
        }));
        const rolePerms = (await getConfig(pb, 'role_perms')) || {};
        return json({
            users,
            rolePerms,
            defaults: DEFAULT_ROLE_PERMS,
            menuKeys: MENU_KEYS,
        });
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler beim Laden' }, 500);
    }
}

export async function POST({ request }) {
    const ctx = await requireAdmin(request);
    if ('error' in ctx) return ctx.error;
    const { pb, roleMap } = ctx;

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger Body' }, 400);
    }

    try {
        // 1) Einzelne Rollenzuweisung.
        if (typeof body.userId === 'string' && typeof body.role === 'string') {
            const role = body.role as AppRole;
            if (!['admin', 'leiter', 'prediger'].includes(role)) {
                return json({ error: 'Unbekannte Rolle' }, 400);
            }
            const next = { ...roleMap, [body.userId]: role };
            await setConfig(pb, 'user_roles', next);
            return json({ success: true });
        }
        // 2) Rechte-Matrix speichern.
        if (body.rolePerms && typeof body.rolePerms === 'object') {
            await setConfig(pb, 'role_perms', body.rolePerms);
            return json({ success: true });
        }
        return json({ error: 'Nichts zu speichern' }, 400);
    } catch (e: any) {
        return json({ error: e?.message || 'Fehler beim Speichern' }, 500);
    }
}
