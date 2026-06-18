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
                memberNames.has(norm(u.name)) || u.id === user.id ||
                roleMap[u.id] !== undefined); // explizit angelegte/zugewiesene

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
        // 0) Neuen Login-Benutzer anlegen (E-Mail + Initialpasswort + Rolle).
        if (body.action === 'createUser') {
            const email = (body.email || '').toString().trim().toLowerCase();
            const name = (body.name || '').toString().trim();
            const password = (body.password || '').toString();
            const role = (body.role || 'prediger') as AppRole;
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                return json({ error: 'Bitte eine gültige E-Mail angeben.' }, 400);
            }
            if (password.length < 8) {
                return json(
                    { error: 'Das Passwort muss mindestens 8 Zeichen haben.' }, 400);
            }
            if (!['admin', 'leiter', 'prediger'].includes(role)) {
                return json({ error: 'Unbekannte Rolle' }, 400);
            }
            // Bereits vorhanden?
            try {
                await pb.collection('users').getFirstListItem(`email="${email}"`);
                return json(
                    { error: 'Es gibt bereits einen Nutzer mit dieser E-Mail.' },
                    409);
            } catch (e: any) {
                if (e?.status && e.status !== 404) throw e;
            }
            let created: any;
            try {
                created = await pb.collection('users').create({
                    email,
                    emailVisibility: true,
                    password,
                    passwordConfirm: password,
                    name: name || email,
                    role,
                });
            } catch (e: any) {
                const detail = e?.response?.data ?? e?.data ?? null;
                console.error('createUser failed:', e?.message || e,
                    detail ? JSON.stringify(detail) : '');
                const msg = detail
                    ? `${e?.message || 'Anlegen fehlgeschlagen'} – ${JSON.stringify(detail)}`
                    : (e?.message || 'Anlegen fehlgeschlagen');
                return json({ error: msg }, 500);
            }
            // Rolle auch explizit in der Rollen-Map verankern.
            await setConfig(pb, 'user_roles', { ...roleMap, [created.id]: role });
            return json({ success: true, id: created.id });
        }
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
