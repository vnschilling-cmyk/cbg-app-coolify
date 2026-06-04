/**
 * Admin-/Konfigurations-Helfer für die JSON-API (Rechteverwaltung).
 *
 * Nutzt die PocketBase-Admin-Credentials (PB_ADMIN_EMAIL/PASSWORD), um
 * - Nutzer aufzulisten (die `users`-Collection ist sonst PII-geschützt),
 * - die `app_config`-Collection bei Bedarf automatisch anzulegen,
 * - Konfig-Werte (Rollen, Rechte-Matrix) zu lesen/schreiben.
 */
import PocketBase from 'pocketbase';
import zlib from 'node:zlib';
import { env } from '$env/dynamic/private';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

const PB_URL = PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';

/**
 * Extrahiert den Fließtext aus einer .docx (ohne externe Library):
 * .docx ist ein ZIP; word/document.xml wird über das Central Directory
 * gefunden, per inflateRaw entpackt und von XML-Tags befreit.
 */
export function extractDocxText(buf: Buffer): string {
    // End Of Central Directory (Signatur 0x06054b50) vom Ende her suchen.
    let eocd = -1;
    const min = Math.max(0, buf.length - 22 - 65536);
    for (let i = buf.length - 22; i >= min; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Keine gültige .docx (ZIP nicht erkannt)');
    const cdCount = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < cdCount; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break;
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        if (name === 'word/document.xml') {
            const lhNameLen = buf.readUInt16LE(localOffset + 26);
            const lhExtraLen = buf.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
            const comp = buf.subarray(dataStart, dataStart + compSize);
            const xml = method === 0 ? comp : zlib.inflateRawSync(comp);
            return xmlToText(xml.toString('utf8'));
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('word/document.xml nicht gefunden');
}

function xmlToText(xml: string): string {
    return xml
        .replace(/<w:tab\b[^>]*\/?>/g, '\t')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:br\b[^>]*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Standard-Prompt (Best Practice) für Sitzungs-/Besprechungsprotokolle. */
export const DEFAULT_PROMPT =
    'Du bist ein erfahrener Assistent für Sitzungs- und Besprechungsprotokolle '
    + '(z. B. Bruderrat/Gemeindeleitung). Überarbeite das folgende Rohprotokoll '
    + 'zu einem klaren, professionellen Protokoll nach Best Practices:\n'
    + '- Kopf: Datum, Anlass/Gremium, Anwesende/Entschuldigte (sofern im Text).\n'
    + '- Gliederung nach Tagesordnungspunkten (TOP) mit Überschriften.\n'
    + '- Pro TOP: kurze Zusammenfassung der Diskussion, dann klar getrennt die '
    + 'Beschlüsse.\n'
    + '- Aufgaben/To-dos als Liste mit Verantwortlichem und (falls genannt) Frist.\n'
    + '- Abschnitt „Offene Punkte / Vertagt".\n'
    + '- Sachlicher, neutraler Stil; indirekte Rede.\n\n'
    + 'Wichtig: Behalte ALLE inhaltlichen Informationen bei, erfinde nichts hinzu '
    + 'und interpretiere nicht über das Geschriebene hinaus. Fehlt eine Angabe, '
    + 'lasse die Rubrik weg. Antworte auf Deutsch in sauberem Markdown.';

/** Überarbeitet ein Protokoll per Google Gemini (mit konfigurierbarem Prompt). */
export async function geminiRework(
    text: string,
    apiKey: string,
    template?: string,
): Promise<string> {
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const instruction = (template && template.trim()) ? template : DEFAULT_PROMPT;
    const prompt = `${instruction}\n\n--- ROHPROTOKOLL ---\n${text}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
        }),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `Gemini-Fehler ${res.status}`);
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

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

const _AUTH_RULES = {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
};

/**
 * Legt eine Collection an – formatunabhängig: erst das neue `fields`-Format
 * (PocketBase ≥ 0.23), bei Fehler das alte `schema`-Format (≤ 0.22).
 * `fields` = Liste { name, type, required?, ...optionen }.
 */
async function createCollection(
    pb: PocketBase,
    name: string,
    fields: any[],
): Promise<void> {
    try {
        await pb.collections.create({
            name, type: 'base', fields, ..._AUTH_RULES,
        });
        return;
    } catch (eNew: any) {
        // Altes Format: { schema: [{ name, type, required, options }] }
        const schema = fields.map((f: any) => {
            const { name: fn, type, required, ...rest } = f;
            return { name: fn, type, required: !!required, options: rest };
        });
        try {
            await pb.collections.create({
                name, type: 'base', schema, ..._AUTH_RULES,
            });
        } catch (eOld: any) {
            console.error(
                `createCollection ${name} failed (new):`, eNew?.message,
                '| (old):', eOld?.message);
            throw eOld;
        }
    }
}

/** Legt die `app_config`-Collection an, falls sie noch nicht existiert. */
export async function ensureAppConfig(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('app_config');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'app_config', [
        { name: 'key', type: 'text', required: true },
        { name: 'value', type: 'json', maxSize: 2000000 },
    ]);
}

/** Legt die `protocols`-Collection an, falls sie noch nicht existiert. */
export async function ensureProtocols(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('protocols');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    // Kein Datei-Feld (auf älterem PocketBase beim Anlegen problematisch);
    // die Original-Datei wird als Base64 in einem Textfeld abgelegt.
    await createCollection(pb, 'protocols', [
        { name: 'title', type: 'text', required: true },
        { name: 'date', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'file_name', type: 'text' },
        { name: 'original_b64', type: 'text', maxSize: 30000000 },
        { name: 'original_text', type: 'text', maxSize: 2000000 },
        { name: 'reworked_text', type: 'text', maxSize: 2000000 },
    ]);
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

/** Aktiver Auswertungs-Prompt aus app_config ('llm_prompts'); sonst Default. */
export async function getActivePrompt(pb: PocketBase): Promise<string> {
    try {
        const cfg = await getConfig(pb, 'llm_prompts');
        const list = cfg?.prompts;
        const active = typeof cfg?.active === 'number' ? cfg.active : 0;
        if (Array.isArray(list) && list[active]?.text?.trim()) {
            return list[active].text;
        }
    } catch (e: any) {
        console.error('getActivePrompt:', e?.message || e);
    }
    return DEFAULT_PROMPT;
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
