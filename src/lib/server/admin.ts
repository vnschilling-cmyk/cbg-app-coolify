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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ein einzelner Gemini-Aufruf für ein bestimmtes Modell.
 * Liefert { text } bei Erfolg, sonst { status, message } zur Auswertung
 * (Überlastung/Rate-Limit vs. echter Fehler) durch den Aufrufer.
 */
async function geminiCall(
    model: string,
    prompt: string,
    apiKey: string,
): Promise<{ ok: boolean; status: number; text?: string; message?: string }> {
    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    // thinkingBudget: 0 schaltet das „Denken" der 2.5-Modelle ab – für
    // Protokoll-Formatierung unnötig, spart Last (weniger 503) und Zeit.
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                thinkingConfig: { thinkingBudget: 0 },
            },
        }),
    });
    let j: any = {};
    try { j = await res.json(); } catch { /* leere/ungültige Antwort */ }
    if (!res.ok) {
        return {
            ok: false,
            status: res.status,
            message: j?.error?.message || `Gemini-Fehler ${res.status}`,
        };
    }
    return {
        ok: true,
        status: 200,
        text: j?.candidates?.[0]?.content?.parts?.[0]?.text || '',
    };
}

/**
 * Überarbeitet ein Protokoll per Google Gemini (mit konfigurierbarem Prompt).
 * Robust gegen Überlastung: Retry mit Backoff + automatischer Fallback auf
 * stabilere Modelle, falls eines „high demand" (503/429) meldet.
 */
export async function geminiRework(
    text: string,
    apiKey: string,
    template?: string,
): Promise<string> {
    const instruction = (template && template.trim()) ? template : DEFAULT_PROMPT;
    const prompt = `${instruction}\n\n--- ROHPROTOKOLL ---\n${text}`;

    // Modell-Kette: konfiguriertes Modell zuerst, dann stabile Alternativen.
    const preferred = (env.GEMINI_MODEL || '').trim();
    const chain = [
        preferred,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i); // leere/Duplikate raus

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        // Pro Modell bis zu 3 Versuche bei Überlastung (503) / Rate-Limit (429).
        for (let attempt = 1; attempt <= 3; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) return r.text || '';
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) {
                // Echter Fehler (z. B. Modell unbekannt) → nächstes Modell.
                break;
            }
            if (attempt < 3) await sleep(attempt * 1500); // 1,5s, dann 3s
        }
    }
    throw new Error(lastMsg);
}

// ---------------------------------------------------------------------------
// Einheitliche Protokoll-Benennung
//   Titel:  „YYYY-MM-DD Protokoll <Gremium>"
//   Datum:  Sitzungsdatum aus dem Dokument, sonst aus dem Dateinamen,
//           sonst Upload-Datum (heute).
// ---------------------------------------------------------------------------

const _MONTHS: Record<string, string> = {
    januar: '01', februar: '02', 'märz': '03', maerz: '03', april: '04',
    mai: '05', juni: '06', juli: '07', august: '08', september: '09',
    oktober: '10', november: '11', dezember: '12',
};

/** Erstes erkennbares Datum in einem Text → ISO „YYYY-MM-DD" (oder null). */
function firstDate(s: string): string | null {
    if (!s) return null;
    // ISO 2026-01-24
    let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // „24. Januar 2026" / „24 Januar 2026"
    m = s.match(
        /\b(\d{1,2})\.?\s+(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})\b/i,
    );
    if (m) {
        const mo = _MONTHS[m[2].toLowerCase()];
        if (mo) return `${m[3]}-${mo}-${String(+m[1]).padStart(2, '0')}`;
    }
    // „24.01.2026" / „24.1.26"
    m = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (m) {
        const d = +m[1], mon = +m[2];
        let y = +m[3];
        if (y < 100) y += 2000;
        if (mon >= 1 && mon <= 12 && d >= 1 && d <= 31) {
            return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
    }
    return null;
}

/**
 * Einheitlicher Protokoll-Titel + Datum aus Dateiname und Dokumenttext.
 * Titel: „YYYY-MM-DD Protokoll BR" (Gremium ist immer der Bruderrat).
 */
export function normalizeProtocol(
    name: string,
    text: string,
): { title: string; date: string } {
    const today = new Date().toISOString().slice(0, 10);
    // Sitzungsdatum bevorzugt aus dem Dokumentanfang, dann Dateiname, dann heute.
    const date = firstDate((text || '').slice(0, 1500)) ||
        firstDate(name) || today;
    const title = `${date} Protokoll BR`;
    return { title, date };
}

/** Die App-Rollen. */
export type AppRole = 'admin' | 'leiter' | 'prediger';

/** Menü-Schlüssel (entsprechen den NavSections der Flutter-App). */
export const MENU_KEYS = [
    'overview',
    'prediger',
    'bruderrat',
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

/** Einfache, kollisionsarme ID (für JSON-Datensätze in app_config). */
export function genId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Aus einer Telegram-Nachricht einen Agenda-Vorschlag ableiten (oder null). */
export function agendaSuggestionFromMessage(
    m: any,
    agendaThread: string,
): { text: string; name: string; tgUserId: string } | null {
    if (!m) return null;
    const thread = (m.message_thread_id ?? '').toString();
    if (agendaThread && thread !== agendaThread) return null;
    if (!m.text) return null;
    if (m.from?.is_bot) return null;
    if (m.forum_topic_created || m.forum_topic_edited) return null;
    const name = `${m.from?.first_name || ''} ${m.from?.last_name || ''}`.trim() ||
        (m.from?.username || '').toString();
    return {
        text: m.text.toString(),
        name,
        tgUserId: m.from?.id != null ? String(m.from.id) : '',
    };
}

/** Titel normalisieren (für Dedup): klein, getrimmt, Mehrfach-Spaces weg. */
function normTitle(s: string): string {
    return (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Telegram-Nachrichten via Gemini in echte Agenda-Themen zerlegen und als
 * eigene TOPs (Titel = Themenname) in die neueste Agenda einfügen – jeweils
 * VOR der „Gebetszeit (Abschluss)". Kein Telegram-Vermerk, kein Absender.
 * Dedup gegen vorhandene TOP-Titel.
 */
export async function appendAgendaSuggestions(
    pb: PocketBase,
    suggestions: { text: string; name: string; tgUserId: string }[],
): Promise<number> {
    if (!suggestions.length) return 0;
    const agendas = (await getConfig(pb, 'bruderrat_agendas')) as any[];
    const list = Array.isArray(agendas) ? agendas : [];
    if (!list.length) return 0;
    list.sort((a, b) =>
        (b?.date || '').toString().localeCompare((a?.date || '').toString()));
    const ag = list[0];
    ag.items = Array.isArray(ag.items) ? ag.items : [];

    // Jede Nachricht per KI in echte Themen-Titel zerlegen.
    const apiKey = env.GEMINI_API_KEY || '';
    const titles: string[] = [];
    for (const s of suggestions) {
        const pts = await geminiAgendaPoints(s.text, apiKey);
        titles.push(...pts);
    }
    if (!titles.length) return 0;

    // Bereits vorhandene TOP-Titel (Dedup).
    const seen = new Set(
        ag.items.map((it: any) => normTitle((it?.title || '').toString())));

    // Einfügeposition: vor „Gebetszeit (Abschluss)" / „Abschluss".
    let insertAt = ag.items.findIndex((it: any) =>
        /abschluss/i.test((it?.title || '').toString()));
    if (insertAt < 0) insertAt = ag.items.length;

    let added = 0;
    for (const t of titles) {
        const key = normTitle(t);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        ag.items.splice(insertAt, 0, { id: genId(), title: t, points: [] });
        insertAt++; // weitere Themen direkt dahinter, weiterhin vor Abschluss
        added++;
    }
    if (added) await setConfig(pb, 'bruderrat_agendas', list);
    return added;
}

/** Prompt zur Extraktion von Beschlüssen und Aufgaben aus einem Protokoll. */
const EXTRACT_PROMPT =
    'Du extrahierst aus einem Sitzungsprotokoll (Bruderrat) strukturierte '
    + 'Daten. Gib AUSSCHLIESSLICH gültiges JSON zurück (keine Erklärung, kein '
    + 'Markdown, keine Code-Zäune) mit exakt dieser Form:\n'
    + '{"decisions":[{"title":"kurzer Titel","text":"vollständiger Beschluss"}],'
    + '"tasks":[{"title":"Aufgabe","assignee":"Verantwortlicher oder leer",'
    + '"due":"YYYY-MM-DD oder leer"}]}\n'
    + 'Regeln: Nur tatsächlich gefasste Beschlüsse bzw. konkrete Aufgaben/To-dos '
    + 'aufnehmen. Nichts erfinden. Wenn nichts vorhanden ist, leere Arrays. '
    + 'Antworte auf Deutsch.';

/** Erstes JSON-Objekt aus einem Text herauslösen (robust gegen Code-Zäune). */
function parseJsonLoose(s: string): any {
    if (!s) return null;
    let t = s.trim();
    // Code-Zäune entfernen.
    t = t.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
    try { return JSON.parse(t); } catch { /* weiter versuchen */ }
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
        try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ }
    }
    return null;
}

/**
 * Extrahiert Beschlüsse + Aufgaben aus einem Protokolltext via Gemini.
 * Liefert { decisions: [{title,text}], tasks: [{title,assignee,due}] }.
 */
export async function geminiExtract(
    text: string,
    apiKey: string,
): Promise<{ decisions: any[]; tasks: any[] }> {
    const prompt = `${EXTRACT_PROMPT}\n\n--- PROTOKOLL ---\n${text}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                return {
                    decisions: Array.isArray(j?.decisions) ? j.decisions : [],
                    tasks: Array.isArray(j?.tasks) ? j.tasks : [],
                };
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) break;
            if (attempt < 3) await sleep(attempt * 1500);
        }
    }
    throw new Error(lastMsg);
}

/** Prompt: aus einer Telegram-Nachricht echte Agenda-Themen ableiten. */
const AGENDA_POINTS_PROMPT =
    'Du wandelst eine kurze Telegram-Nachricht in eine Liste echter '
    + 'Agenda-Themen für eine Bruderrat-Sitzung um. Eine Nachricht kann '
    + 'MEHRERE Themen enthalten – trenne sie. Gib AUSSCHLIESSLICH gültiges '
    + 'JSON zurück (keine Erklärung, kein Markdown, keine Code-Zäune) in '
    + 'exakt dieser Form: {"points":["Thema 1","Thema 2"]}\n'
    + 'Regeln: Jeder Punkt ist ein kurzer, prägnanter Themen-Titel (1–5 '
    + 'Wörter, Nominalform, ohne abschließenden Punkt). Entferne Floskeln '
    + 'wie „Ich hätte noch", „Bitte", „der Punkt". Erfinde nichts. Enthält '
    + 'die Nachricht kein echtes Thema (z. B. Smalltalk), gib ein leeres '
    + 'Array. Antworte auf Deutsch.';

/**
 * Zerlegt eine Telegram-Nachricht per Gemini in echte Agenda-Themen-Titel.
 * Fällt bei Fehler/ohne Key auf den (getrimmten) Rohtext zurück.
 */
export async function geminiAgendaPoints(
    text: string,
    apiKey: string,
): Promise<string[]> {
    const clean = (text || '').trim();
    if (!clean) return [];
    if (!apiKey) return [clean];
    const prompt = `${AGENDA_POINTS_PROMPT}\n\n--- NACHRICHT ---\n${clean}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                const pts = Array.isArray(j?.points) ? j.points : [];
                const titles = pts
                    .map((p: any) => (p ?? '').toString().trim())
                    .filter((p: string) => p.length > 0);
                // Falls die KI nichts Brauchbares liefert: Rohtext behalten.
                return titles.length ? titles : [clean];
            }
            const transient = r.status === 503 || r.status === 429;
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    // Gemini nicht erreichbar → Rohtext nicht verlieren.
    return [clean];
}

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
    // Text-Felder ohne maxSize (das gilt nur für json/file; auf Text-Feldern
    // ließ es das Anlegen scheitern -> 500). Text ist ohnehin unbegrenzt.
    await createCollection(pb, 'protocols', [
        { name: 'title', type: 'text', required: true },
        { name: 'date', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'file_name', type: 'text' },
        { name: 'original_b64', type: 'text' },
        { name: 'original_text', type: 'text' },
        { name: 'reworked_text', type: 'text' },
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
    // Alt-Schlüssel migrieren: „besprechungen" wurde zu „bruderrat" umbenannt,
    // damit zuvor gespeicherte Rechte-Matrizen den neuen Bereich weiter freigeben.
    const menus = Array.isArray(s.menus)
        ? [...new Set(s.menus.map((m) =>
            (m === 'besprechungen' ? 'bruderrat' : m)))]
        : def.menus;
    return {
        menus,
        churchtools: typeof s.churchtools === 'boolean' ? s.churchtools : def.churchtools,
        berechtigungen:
            typeof s.berechtigungen === 'boolean' ? s.berechtigungen : def.berechtigungen,
        konfiguration:
            typeof s.konfiguration === 'boolean' ? s.konfiguration : def.konfiguration,
    };
}
