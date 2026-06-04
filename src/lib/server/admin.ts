/**
 * Admin-/Konfigurations-Helfer für die JSON-API (Rechteverwaltung).
 *
 * Nutzt die PocketBase-Admin-Credentials (PB_ADMIN_EMAIL/PASSWORD), um
 * - Nutzer aufzulisten (die `users`-Collection ist sonst PII-geschützt),
 * - die `app_config`-Collection bei Bedarf automatisch anzulegen,
 * - Konfig-Werte (Rollen, Rechte-Matrix) zu lesen/schreiben.
 */
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

const PB_URL = PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';

/** Die App-Rollen. */
export type AppRole = 'admin' | 'leiter' | 'prediger';

/** Menü-Schlüssel (entsprechen den NavSections der Flutter-App). */
export const MENU_KEYS = [
    'overview',
    'prediger',
    'besprechungen',
    'gottesdienstleitung',
    'einstellungen',
] as const;

export type RolePerms = {
    menus: string[];
    churchtools: boolean;
    berechtigungen: boolean;
    konfiguration: boolean;
};

/** Standard-Rechte je Rolle (frei in der App überschreibbar). */
export const DEFAULT_ROLE_PERMS: Record<AppRole, RolePerms> = {
    admin: {
        menus: [...MENU_KEYS],
        churchtools: true,
        berechtigungen: true,
        konfiguration: true,
    },
    leiter: {
        menus: [...MENU_KEYS],
        churchtools: true,
        berechtigungen: true,
        konfiguration: true,
    },
    prediger: {
        menus: ['overview', 'prediger', 'gottesdienstleitung', 'einstellungen'],
        churchtools: false,
        berechtigungen: false,
        konfiguration: false,
    },
};

/** Admin-authentifizierte PocketBase-Instanz (wie im Sync). */
export async function adminPb(): Promise<PocketBase> {
    const pb = new PocketBase(PB_URL);
    let pw = env.PB_ADMIN_PASSWORD || '';
    if (pw.startsWith("'") && pw.endsWith("'")) pw = pw.slice(1, -1);
    await pb.admins.authWithPassword(env.PB_ADMIN_EMAIL || '', pw);
    return pb;
}

/** Legt die `app_config`-Collection an, falls sie noch nicht existiert. */
export async function ensureAppConfig(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('app_config');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    try {
        await pb.collections.create({
            name: 'app_config',
            type: 'base',
            fields: [
                { name: 'key', type: 'text', required: true },
                { name: 'value', type: 'json', maxSize: 2000000 },
            ],
            indexes: [
                'CREATE UNIQUE INDEX `idx_app_config_key` ON `app_config` (`key`)',
            ],
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
        });
    } catch (e: any) {
        // z. B. wenn parallel angelegt – ignorieren, sonst weiterreichen.
        console.error('ensureAppConfig:', e?.message || e);
    }
}

/** Legt die `protocols`-Collection an, falls sie noch nicht existiert. */
export async function ensureProtocols(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('protocols');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    try {
        await pb.collections.create({
            name: 'protocols',
            type: 'base',
            fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'date', type: 'text' },
                { name: 'status', type: 'text' },
                {
                    name: 'original_file',
                    type: 'file',
                    maxSelect: 1,
                    maxSize: 26214400,
                },
                { name: 'original_text', type: 'text', maxSize: 2000000 },
                { name: 'reworked_text', type: 'text', maxSize: 2000000 },
            ],
            listRule: '@request.auth.id != ""',
            viewRule: '@request.auth.id != ""',
            createRule: '@request.auth.id != ""',
            updateRule: '@request.auth.id != ""',
            deleteRule: '@request.auth.id != ""',
        });
    } catch (e: any) {
        console.error('ensureProtocols:', e?.message || e);
    }
}

export async function getConfig(pb: PocketBase, key: string): Promise<any> {
    try {
        const rec = await pb
            .collection('app_config')
            .getFirstListItem(`key="${key}"`);
        return rec.value ?? null;
    } catch (e: any) {
        if (e?.status === 404) return null;
        throw e;
    }
}

export async function setConfig(
    pb: PocketBase,
    key: string,
    value: any,
): Promise<void> {
    try {
        const rec = await pb
            .collection('app_config')
            .getFirstListItem(`key="${key}"`);
        await pb.collection('app_config').update(rec.id, { value });
    } catch (e: any) {
        if (e?.status === 404) {
            await pb.collection('app_config').create({ key, value });
        } else {
            throw e;
        }
    }
}

/** Effektive Rolle eines Nutzers: manuelle Zuweisung vor Sync-Default. */
export function effectiveRole(
    userId: string,
    syncRole: string | undefined,
    roleMap: Record<string, string>,
): AppRole {
    // Bootstrap: Solange KEIN Nutzer explizit als Admin gesetzt ist, gilt jeder
    // als Admin – damit die Rechteverwaltung erreichbar ist und überhaupt Rollen
    // vergeben werden können. Sobald ein Admin existiert, greifen die Regeln.
    const hasAdmin = roleMap && Object.values(roleMap).includes('admin');
    if (!hasAdmin) return 'admin';

    const manual = roleMap?.[userId];
    if (manual === 'admin' || manual === 'leiter' || manual === 'prediger') {
        return manual;
    }
    // Fallback: synchronisierte Admins bleiben Admin, sonst Prediger.
    return syncRole === 'admin' ? 'admin' : 'prediger';
}

/** Rechte einer Rolle (gespeicherte Matrix vor Default). */
export function permsForRole(
    role: AppRole,
    stored: Record<string, Partial<RolePerms>> | null,
): RolePerms {
    const def = DEFAULT_ROLE_PERMS[role];
    const s = stored?.[role];
    if (!s) return def;
    return {
        menus: Array.isArray(s.menus) ? s.menus : def.menus,
        churchtools: typeof s.churchtools === 'boolean' ? s.churchtools : def.churchtools,
        berechtigungen:
            typeof s.berechtigungen === 'boolean' ? s.berechtigungen : def.berechtigungen,
        konfiguration:
            typeof s.konfiguration === 'boolean' ? s.konfiguration : def.konfiguration,
    };
}
