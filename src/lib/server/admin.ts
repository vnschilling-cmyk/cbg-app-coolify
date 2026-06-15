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
import { ChurchToolsClient } from '$lib/server/churchtools';

/** CT-Gruppe „Jugend" (Leiter/Co-Leiter = Jugendleitung, Bearbeitungsrecht). */
export const JUGEND_GROUP_ID = 19;

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
async function geminiCallParts(
    model: string,
    parts: any[],
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
            contents: [{ parts }],
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

function geminiCall(model: string, prompt: string, apiKey: string) {
    return geminiCallParts(model, [{ text: prompt }], apiKey);
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

/**
 * Überarbeitet ein PDF-Protokoll per Gemini – das PDF wird direkt als
 * inlineData mitgeschickt (kein lokaler Text-Extraktor nötig). Liefert die
 * KI-Fassung (Markdown).
 */
export async function geminiReworkPdf(
    b64: string,
    apiKey: string,
    template?: string,
): Promise<string> {
    const instruction = (template && template.trim()) ? template : DEFAULT_PROMPT;
    const parts = [
        { text: `${instruction}\n\n--- ROHPROTOKOLL (PDF im Anhang) ---` },
        { inlineData: { mimeType: 'application/pdf', data: b64 } },
    ];
    const preferred = (env.GEMINI_MODEL || '').trim();
    const chain = [
        preferred,
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const r = await geminiCallParts(model, parts, apiKey);
            if (r.ok) return r.text || '';
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) break;
            if (attempt < 3) await sleep(attempt * 1500);
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
    'jugend',
    'einstellungen',
] as const;

export type RolePerms = {
    menus: string[];
    churchtools: boolean;
    berechtigungen: boolean;
    konfiguration: boolean;
    // Darf Dienstpläne bearbeiten (Editor schreiben) UND bekommt die offenen
    // Plan-Dienste als Aufgaben auf dem Dashboard.
    dienstplaner: boolean;
};

/** Standard-Rechte je Rolle (frei in der App überschreibbar). */
export const DEFAULT_ROLE_PERMS: Record<AppRole, RolePerms> = {
    admin: {
        menus: [...MENU_KEYS],
        churchtools: true,
        berechtigungen: true,
        konfiguration: true,
        dienstplaner: true,
    },
    leiter: {
        menus: [...MENU_KEYS],
        churchtools: true,
        berechtigungen: true,
        konfiguration: true,
        dienstplaner: false,
    },
    prediger: {
        menus: ['overview', 'prediger', 'gottesdienstleitung', 'einstellungen'],
        churchtools: false,
        berechtigungen: false,
        konfiguration: false,
        dienstplaner: false,
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
 * VOR der „Gebetszeit (Abschluss)". Der Einsender wird als verstecktes
 * Markierungs-Element (leerer Text + name + tgUserId) am TOP hinterlegt und
 * in der Titelzeile als Pille angezeigt. Dedup gegen vorhandene TOP-Titel.
 */
export async function appendAgendaSuggestions(
    pb: PocketBase,
    suggestions: { text: string; name: string; tgUserId: string }[],
): Promise<number> {
    if (!suggestions.length) return 0;
    await ensureBruderratMeetings(pb);
    const meetings = (await getConfig(pb, 'bruderrat_meetings')) as any[];
    const list = Array.isArray(meetings) ? meetings : [];
    if (!list.length) return 0;
    // Neueste GEPLANTE Sitzung bevorzugen (Telegram-Punkte sind Planung);
    // sonst die neueste Sitzung überhaupt.
    list.sort((a, b) =>
        (b?.date || '').toString().localeCompare((a?.date || '').toString()));
    const ag = list.find((m) => (m?.status || 'geplant') === 'geplant') || list[0];
    ag.items = Array.isArray(ag.items) ? ag.items : [];

    // Jede Nachricht per KI in echte Themen-Titel zerlegen – Einsender behalten.
    const apiKey = env.GEMINI_API_KEY || '';
    const themes: { title: string; name: string; tgUserId: string }[] = [];
    for (const s of suggestions) {
        const pts = await geminiAgendaPoints(s.text, apiKey);
        for (const t of pts) {
            themes.push({ title: t, name: s.name || '', tgUserId: s.tgUserId || '' });
        }
    }
    if (!themes.length) return 0;

    // Bereits vorhandene TOP-Titel (Dedup).
    const seen = new Set(
        ag.items.map((it: any) => normTitle((it?.title || '').toString())));

    // Einfügeposition: vor „Gebetszeit (Abschluss)" / „Abschluss".
    let insertAt = ag.items.findIndex((it: any) =>
        /abschluss/i.test((it?.title || '').toString()));
    if (insertAt < 0) insertAt = ag.items.length;

    let added = 0;
    for (const th of themes) {
        const key = normTitle(th.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        // Einsender als verstecktes Markierungs-Element (leerer Text).
        const points = (th.name || th.tgUserId)
            ? [{ id: genId(), text: '', name: th.name, tgUserId: th.tgUserId }]
            : [];
        ag.items.splice(insertAt, 0, { id: genId(), title: th.title, points });
        insertAt++; // weitere Themen direkt dahinter, weiterhin vor Abschluss
        added++;
    }
    if (added) await setConfig(pb, 'bruderrat_meetings', list);
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

/** Prompt: semantische Suche über alle Bruderrat-Einträge. */
const SEARCH_PROMPT =
    'Du bist eine Suchhilfe für die Bruderrat-Verwaltung einer Kirchengemeinde. '
    + 'Du bekommst eine Suchanfrage und eine Liste von Einträgen (Agenda-Punkte, '
    + 'Protokolle, Beschlüsse, Aufgaben), jeweils mit einer id. Finde ALLE '
    + 'Einträge, die zur Anfrage passen oder damit zu tun haben könnten – auch '
    + 'thematisch/sinnverwandt, nicht nur wörtlich. Gib AUSSCHLIESSLICH gültiges '
    + 'JSON zurück (keine Erklärung, kein Markdown, keine Code-Zäune) in exakt '
    + 'dieser Form: {"matchIds":["id1","id2"],"summary":"..."}. '
    + 'matchIds: die ids der relevanten Einträge, sortiert nach Relevanz '
    + '(relevanteste zuerst), höchstens 30. summary: eine kurze deutsche '
    + 'Zusammenfassung (2–4 Sätze), was die gefundenen Einträge im Hinblick auf '
    + 'die Anfrage aussagen. Passt nichts, gib ein leeres Array und erkläre das '
    + 'in summary. Erfinde nichts.';

/**
 * Semantische Suche über vorbereitete Bruderrat-Einträge via Gemini.
 * `corpus` = [{ id, kind, text }]. Liefert { matchIds, summary }.
 * Fällt bei Fehler/ohne Key auf leere Treffer zurück (Aufrufer ergänzt
 * lokale Textsuche).
 */
export async function geminiSearch(
    query: string,
    corpus: { id: string; kind: string; text: string }[],
    apiKey: string,
): Promise<{ matchIds: string[]; summary: string }> {
    const q = (query || '').trim();
    if (!q || !apiKey || corpus.length === 0) {
        return { matchIds: [], summary: '' };
    }
    const lines = corpus
        .map((c) => `- id=${c.id} (${c.kind}): ${(c.text || '').replace(/\s+/g, ' ').slice(0, 400)}`)
        .join('\n');
    const prompt =
        `${SEARCH_PROMPT}\n\n--- SUCHANFRAGE ---\n${q}\n\n--- EINTRÄGE ---\n${lines}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                const ids = Array.isArray(j?.matchIds) ? j.matchIds : [];
                return {
                    matchIds: ids.map((x: any) => (x ?? '').toString()).filter(Boolean),
                    summary: (j?.summary ?? '').toString(),
                };
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
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

/** Prompt: frei geschriebenes Protokoll in TOPs strukturieren. */
const STRUCTURE_PROMPT =
    'Du strukturierst ein frei geschriebenes Bruderrat-Protokoll in '
    + 'Tagesordnungspunkte (TOPs). Gib AUSSCHLIESSLICH gültiges JSON zurück '
    + '(keine Erklärung, kein Markdown, keine Code-Zäune) in exakt dieser '
    + 'Form: {"tops":[{"title":"...","points":[{"text":"...","name":""}]}]}. '
    + 'Regeln: Jeder TOP hat einen kurzen, prägnanten Titel und eine Liste von '
    + 'Punkten. „text" ist der Inhalt eines Punktes (knapper, vollständiger '
    + 'Satz). „name" ist die zuständige Person – NUR wenn eindeutig genannt, '
    + 'sonst leerer String. Erkenne vorhandene Strukturen (z. B. Zeilen, die '
    + 'mit „TOP" beginnen) und übernimm deren Titel. Behalte ALLE inhaltlichen '
    + 'Informationen bei, fasse sinnvoll zusammen, erfinde nichts. Antworte '
    + 'auf Deutsch.';

/**
 * Strukturiert einen Protokoll-Freitext per Gemini in TOPs + Punkte.
 * Liefert { tops: [{ title, points: [{ text, name }] }] }.
 */
export async function geminiStructure(
    text: string,
    apiKey: string,
): Promise<{ tops: { title: string; points: { text: string; name: string }[] }[] }> {
    const clean = (text || '').trim();
    if (!clean) return { tops: [] };
    if (!apiKey) throw new Error('Kein KI-Schlüssel konfiguriert.');
    const prompt = `${STRUCTURE_PROMPT}\n\n--- FREITEXT ---\n${clean}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                const raw = Array.isArray(j?.tops) ? j.tops : [];
                const tops = raw.map((t: any) => ({
                    title: (t?.title ?? '').toString(),
                    points: (Array.isArray(t?.points) ? t.points : [])
                        .map((p: any) => ({
                            text: (p?.text ?? '').toString(),
                            name: (p?.name ?? '').toString(),
                        }))
                        .filter((p: { text: string }) => p.text.trim().length > 0),
                }));
                return { tops };
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    throw new Error(lastMsg);
}

/** Prompt: gesprochenen/getippten Gedanken aufbereiten + Ziel bestimmen. */
const CAPTURE_PROMPT =
    'Du bekommst einen kurzen, gesprochenen oder getippten Gedanken eines '
    + 'Bruderratsmitglieds. Formuliere ihn in sauberem, knappem Hochdeutsch. '
    + 'Entscheide das Ziel: „agenda" = ein Punkt für die NÄCHSTE Besprechung/ '
    + 'Agenda; „theme" = eine Idee/ein Thema für später (Themen-Pool). '
    + 'Hinweise wie „für die nächste Besprechung/Agenda/Sitzung" → agenda; '
    + '„Idee/Thema für später, irgendwann" → theme; im Zweifel theme. '
    + 'Gib AUSSCHLIESSLICH gültiges JSON zurück (keine Erklärung, kein '
    + 'Markdown, keine Code-Zäune): {"kind":"agenda|theme","title":"kurzer '
    + 'prägnanter Titel","text":"1–2 Sätze in sauberem Deutsch"}.';

/**
 * Wertet einen Sprach-/Text-Schnipsel per Gemini aus → { kind, title, text }.
 * kind ∈ 'agenda' | 'theme'. Ohne Key/Fehler Fallback auf Rohtext als Thema.
 */
export async function geminiCapture(
    text: string,
    apiKey: string,
): Promise<{ kind: string; title: string; text: string }> {
    const clean = (text || '').trim();
    const fallback = {
        kind: 'theme',
        title: clean.length > 60 ? `${clean.slice(0, 57)}…` : clean,
        text: clean,
    };
    if (!clean || !apiKey) return fallback;
    const prompt = `${CAPTURE_PROMPT}\n\n--- EINGABE ---\n${clean}`;
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
                const kind = (j?.kind === 'agenda') ? 'agenda' : 'theme';
                const title = (j?.title ?? '').toString().trim();
                const txt = (j?.text ?? '').toString().trim();
                if (!title && !txt) return fallback;
                return { kind, title: title || fallback.title, text: txt || title };
            }
            const transient = r.status === 503 || r.status === 429;
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    return fallback;
}

/** Prompt: Diskussionsverlauf → Beschluss + Mitteilungstexte. */
const PROTOCOL_TEXTS_PROMPT =
    'Du fasst die Diskussion zu EINEM Tagesordnungspunkt einer Bruderrats-'
    + 'Sitzung zusammen. Eingabe: das Thema des Punkts und der Diskussionsverlauf '
    + '(Redebeiträge mit Sprecher). Formuliere sachlich, positiv und wertschätzend '
    + 'in sauberem Hochdeutsch. Gib AUSSCHLIESSLICH gültiges JSON zurück (keine '
    + 'Erklärung, kein Markdown, keine Code-Zäune): '
    + '{"beschluss":"...","mitteilungKurz":"...","mitteilungLang":"..."}\n'
    + 'beschluss: der gefasste Beschluss als 1–2 klare, formale Sätze.\n'
    + 'mitteilungKurz: 1 knapper Satz als Mitteilung an die Gemeinde.\n'
    + 'mitteilungLang: 2–4 Sätze als ausführlichere Mitteilung an die Gemeinde.\n'
    + 'Erfinde keine Inhalte; stütze dich nur auf die Diskussion. Antworte Deutsch.';

/**
 * KI: leitet aus dem Diskussionsverlauf eines Punkts einen Beschlussvorschlag
 * und zwei Mitteilungstexte (knapp/ausführlich) ab. Vorschläge – manuell
 * anpassbar. Ohne Key/Inhalt → leere Strings (Fallback: Punkt-Text).
 */
export async function geminiProtocolTexts(
    pointText: string,
    discussion: { name?: string; text?: string }[],
    apiKey: string,
): Promise<{ beschluss: string; mitteilungKurz: string; mitteilungLang: string }> {
    const lines = (discussion || [])
        .map((d) => `${(d.name || 'Sprecher')}: ${(d.text || '').trim()}`)
        .filter((l) => l.trim().length > 0)
        .join('\n');
    const empty = { beschluss: '', mitteilungKurz: '', mitteilungLang: '' };
    if (!apiKey || (!lines && !(pointText || '').trim())) return empty;
    const prompt = `${PROTOCOL_TEXTS_PROMPT}\n\n--- THEMA ---\n${(pointText || '').trim()}`
        + `\n\n--- DISKUSSION ---\n${lines || '(kein Verlauf – nutze das Thema)'}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                return {
                    beschluss: (j?.beschluss ?? '').toString().trim(),
                    mitteilungKurz: (j?.mitteilungKurz ?? '').toString().trim(),
                    mitteilungLang: (j?.mitteilungLang ?? '').toString().trim(),
                };
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429;
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    throw new Error(lastMsg);
}

/** Prompt: KI-Sekretär – Anfrage über den Content beantworten + Aktionen. */
const ASSISTANT_PROMPT =
    'Du bist der KI-Sekretär einer Gemeinde-Verwaltungs-App (Gremium/Bruderrat). '
    + 'Beantworte die Anfrage des Nutzers anhand der bereitgestellten Inhalte '
    + '(Sitzungen, Protokolle, Beschlüsse, Aufgaben, Themen, Infos). Wenn der '
    + 'Nutzer das Anlegen/Übernehmen von Einträgen wünscht, schlage passende '
    + 'Aktionen vor. Gib AUSSCHLIESSLICH gültiges JSON zurück (keine Erklärung, '
    + 'kein Markdown, keine Code-Zäune): {"answer":"kurze hilfreiche Antwort auf '
    + 'Deutsch","actions":[{"type":"task|decision|theme|info","title":"...",'
    + '"text":"optional","channel":"gottesdienst|gemeindestunde (nur bei info)"}]}. '
    + 'Schlage NUR Aktionen vor, die klar gewünscht sind; sonst leeres '
    + 'actions-Array. Erfinde keine Inhalte; stütze dich auf die Daten.';

/**
 * KI-Sekretär: beantwortet eine Anfrage über den Content und schlägt
 * (optional) ausführbare Aktionen vor. Liefert { answer, actions }.
 */
export async function geminiAssistant(
    query: string,
    corpus: string,
    apiKey: string,
): Promise<{ answer: string; actions: any[] }> {
    const q = (query || '').trim();
    if (!q) return { answer: '', actions: [] };
    if (!apiKey) {
        return { answer: 'KI ist nicht konfiguriert.', actions: [] };
    }
    const prompt = `${ASSISTANT_PROMPT}\n\n--- ANFRAGE ---\n${q}\n\n`
        + `--- INHALTE ---\n${corpus}`;
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    const valid = new Set(['task', 'decision', 'theme', 'info']);
    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCall(model, prompt, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                const rawActions = Array.isArray(j?.actions) ? j.actions : [];
                const actions = rawActions
                    .filter((a: any) => valid.has((a?.type || '').toString()))
                    .map((a: any) => ({
                        type: (a.type || '').toString(),
                        title: (a.title ?? '').toString().trim(),
                        text: (a.text ?? '').toString().trim(),
                        channel: (a.channel ?? '').toString().trim(),
                    }))
                    .filter((a: { title: string }) => a.title.length > 0);
                return { answer: (j?.answer ?? '').toString(), actions };
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429 ||
                /high demand|overloaded|unavailable|try again/i.test(lastMsg);
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    throw new Error(lastMsg);
}

/** PCM (16-bit mono) → WAV-Container (in allen Browsern abspielbar). */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.length;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(numChannels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(byteRate, 28);
    buf.writeUInt16LE(blockAlign, 32);
    buf.writeUInt16LE(bitsPerSample, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    pcm.copy(buf, 44);
    return buf;
}

/**
 * Text-to-Speech via Gemini-TTS → WAV (base64). Browser-unabhängig abspielbar.
 * Wirft bei Fehler/ohne Key (Aufrufer kann auf Browser-TTS zurückfallen).
 */
export async function geminiTts(
    text: string,
    apiKey: string,
): Promise<{ audioBase64: string; mime: string }> {
    const clean = (text || '').trim().slice(0, 5000);
    if (!clean) throw new Error('Kein Text');
    if (!apiKey) throw new Error('Kein KI-Schlüssel');
    const model = 'gemini-2.5-flash-preview-tts';
    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: clean }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        }),
    });
    let j: any = {};
    try { j = await res.json(); } catch { /* leer */ }
    if (!res.ok) throw new Error(j?.error?.message || `TTS-Fehler ${res.status}`);
    const part = j?.candidates?.[0]?.content?.parts?.[0];
    const data = part?.inlineData?.data;
    const mime = (part?.inlineData?.mimeType || '').toString();
    if (!data) throw new Error('Keine Audiodaten erhalten');
    const rate = parseInt((mime.match(/rate=(\d+)/)?.[1] || '24000'), 10);
    const wav = pcmToWav(Buffer.from(data, 'base64'), rate);
    return { audioBase64: wav.toString('base64'), mime: 'audio/wav' };
}

/** Prompt: Personen aus einem Dokument (Liste/Tabelle/Text) extrahieren. */
const PEOPLE_PROMPT =
    'Du extrahierst Personen aus dem beigefügten Dokument (Liste, Tabelle '
    + 'oder Fließtext). Gib AUSSCHLIESSLICH gültiges JSON zurück (keine '
    + 'Erklärung, kein Markdown, keine Code-Zäune): {"people":[{"name":"",'
    + '"email":"","group":"","role":"","note":""}]}. „name" = vollständiger '
    + 'Name (Vor- + Nachname). E-Mail/group/role/note nur, wenn klar '
    + 'erkennbar, sonst leerer String. Erfinde nichts. Antworte auf Deutsch.';

/**
 * Extrahiert Personen via Gemini aus vorbereiteten Parts (Text und/oder
 * inlineData-PDF). Liefert [{name,email,group,role,note}].
 */
export async function geminiExtractPeople(
    parts: any[],
    apiKey: string,
): Promise<{ name: string; email: string; group: string; role: string; note: string }[]> {
    if (!apiKey) throw new Error('Kein KI-Schlüssel konfiguriert.');
    const allParts = [{ text: PEOPLE_PROMPT }, ...parts];
    const chain = [
        (env.GEMINI_MODEL || '').trim(),
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    let lastMsg = 'Gemini nicht erreichbar';
    for (const model of chain) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const r = await geminiCallParts(model, allParts, apiKey);
            if (r.ok) {
                const j = parseJsonLoose(r.text || '');
                const raw = Array.isArray(j?.people) ? j.people : [];
                return raw
                    .map((p: any) => ({
                        name: (p?.name ?? '').toString().trim(),
                        email: (p?.email ?? '').toString().trim(),
                        group: (p?.group ?? '').toString().trim(),
                        role: (p?.role ?? '').toString().trim(),
                        note: (p?.note ?? '').toString().trim(),
                    }))
                    .filter((p: { name: string }) => p.name.length > 0);
            }
            lastMsg = r.message || lastMsg;
            const transient = r.status === 503 || r.status === 429;
            if (!transient) break;
            if (attempt < 2) await sleep(1500);
        }
    }
    throw new Error(lastMsg);
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

/**
 * Stellt sicher, dass die angegebenen Felder in einer bestehenden Collection
 * existieren (idempotente Schema-Erweiterung; legt fehlende Felder nach).
 */
async function ensureFields(
    pb: PocketBase,
    name: string,
    fields: any[],
): Promise<void> {
    let col: any;
    try {
        col = await pb.collections.getOne(name);
    } catch {
        return; // Collection existiert (noch) nicht – nichts zu erweitern.
    }
    const current: any[] = col.fields || col.schema || [];
    const have = new Set(current.map((f: any) => f.name));
    const missing = fields.filter((f) => !have.has(f.name));
    if (!missing.length) return;
    try {
        await pb.collections.update(col.id, { fields: [...current, ...missing] });
        return;
    } catch (eNew: any) {
        const schema = [
            ...current,
            ...missing.map((f: any) => {
                const { name: fn, type, required, ...rest } = f;
                return { name: fn, type, required: !!required, options: rest };
            }),
        ];
        try {
            await pb.collections.update(col.id, { schema });
        } catch (eOld: any) {
            console.error(`ensureFields ${name} failed (new):`, eNew?.message,
                '| (old):', eOld?.message);
        }
    }
}

/** Legt die `freizeiten`-Collection an + stellt das `unterkunft`-Feld sicher. */
export async function ensureFreizeiten(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('freizeiten');
        await ensureFields(pb, 'freizeiten', [
            { name: 'unterkunft', type: 'text' },
        ]);
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'freizeiten', [
        { name: 'titel', type: 'text', required: true },
        { name: 'jahr', type: 'number' },
        { name: 'land', type: 'text' },
        { name: 'motto', type: 'text' },
        { name: 'thema', type: 'text' },
        { name: 'von', type: 'text' }, // yyyy-MM-dd
        { name: 'bis', type: 'text' },
        { name: 'status', type: 'text' }, // geplant | laeuft | durchgefuehrt
        { name: 'unterkunft', type: 'text' }, // id der gewählten Unterkunft
    ]);
}

// Hinweis: KEINE `bool`-Felder – die hiesige PocketBase legt sie über die API
// nicht zuverlässig an (Collection-Anlage schlug fehl). Wahrheitswerte als
// `number` (0/1) ablegen.

/** Legt die `packliste_vorlage`-Collection an (zentrale Packlisten-Vorlage). */
export async function ensurePacklisteVorlage(pb: PocketBase): Promise<void> {
    const fields = [
        { name: 'kategorie', type: 'text' }, // Kleidung / Hygiene / Dokumente …
        { name: 'titel', type: 'text' },
        { name: 'pflicht', type: 'number' }, // 0/1
        { name: 'sort_order', type: 'number' },
    ];
    try {
        await pb.collections.getOne('packliste_vorlage');
        await ensureFields(pb, 'packliste_vorlage', fields);
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'packliste_vorlage', fields);
}

/** Legt die `freizeit_packliste`-Collection an (Packliste je Freizeit). */
export async function ensureFreizeitPackliste(pb: PocketBase): Promise<void> {
    const fields = [
        { name: 'freizeit', type: 'text', required: true },
        { name: 'kategorie', type: 'text' },
        { name: 'titel', type: 'text' },
        { name: 'pflicht', type: 'number' }, // 0/1
        { name: 'sort_order', type: 'number' },
    ];
    try {
        await pb.collections.getOne('freizeit_packliste');
        await ensureFields(pb, 'freizeit_packliste', fields);
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'freizeit_packliste', fields);
}

/** Legt die `freizeit_helfer`-Collection an (Helferliste). */
export async function ensureFreizeitHelfer(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('freizeit_helfer');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'freizeit_helfer', [
        { name: 'freizeit', type: 'text', required: true },
        { name: 'person_name', type: 'text' },
        { name: 'person_id', type: 'text' }, // CT-Personen-ID
        { name: 'rolle', type: 'text' }, // z. B. Küche / Programm / Fahrer
        { name: 'notiz', type: 'text' },
        { name: 'sort_order', type: 'number' },
    ]);
}

/** Legt die `freizeit_checklist`-Collection an (Organisation / Aufgaben). */
export async function ensureFreizeitChecklist(pb: PocketBase): Promise<void> {
    const fields = [
        { name: 'freizeit', type: 'text', required: true },
        { name: 'gruppe', type: 'text' }, // Checklisten-Kategorie
        { name: 'titel', type: 'text' },
        { name: 'erledigt', type: 'number' }, // 0/1 (kein bool, s. o.)
        { name: 'assignee_name', type: 'text' },
        { name: 'assignee_id', type: 'text' }, // CT-Personen-ID
        { name: 'faellig', type: 'text' }, // yyyy-MM-dd
        { name: 'sort_order', type: 'number' },
    ];
    try {
        await pb.collections.getOne('freizeit_checklist');
        await ensureFields(pb, 'freizeit_checklist', fields);
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'freizeit_checklist', fields);
}

/** Legt die `unterkunft_ausflugsziele`-Collection an (Ausflüge/Aktivitäten). */
export async function ensureUnterkunftAusflug(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('unterkunft_ausflugsziele');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'unterkunft_ausflugsziele', [
        { name: 'unterkunft', type: 'text', required: true },
        { name: 'titel', type: 'text' },
        { name: 'beschreibung', type: 'text' },
        { name: 'entfernung_km', type: 'number' },
        { name: 'link', type: 'text' },
        { name: 'kategorie', type: 'text' },
        { name: 'sort_order', type: 'number' },
    ]);
}

/** Legt die `freizeit_agenda`-Collection an (Tagesablauf / Bucket-Agenda). */
export async function ensureFreizeitAgenda(pb: PocketBase): Promise<void> {
    const fields = [
        { name: 'freizeit', type: 'text', required: true },
        { name: 'datum', type: 'text' }, // yyyy-MM-dd (Tages-Bucket)
        { name: 'start_time', type: 'text' }, // HH:MM
        { name: 'duration_minutes', type: 'number' },
        { name: 'titel', type: 'text' },
        { name: 'kategorie', type: 'text' },
        { name: 'ort', type: 'text' },
        { name: 'notiz', type: 'text' },
        // Zuständige Personen (mehrere) als JSON-Array [{name,id}].
        { name: 'verantwortliche', type: 'json', maxSize: 200000 },
        { name: 'sort_order', type: 'number' },
    ];
    try {
        await pb.collections.getOne('freizeit_agenda');
        await ensureFields(pb, 'freizeit_agenda', fields);
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'freizeit_agenda', fields);
}

/** Bewertungskriterien einer Unterkunft (je 1–5 Sterne, 0 = nicht bewertet). */
export const UNTERKUNFT_KRITERIEN = [
    'r_gemeinschaftsraum',
    'r_kueche',
    'r_schlafraeume',
    'r_sanitaer',
    'r_ausstattung', // Spielgeräte/Freizeitmöglichkeiten am Haus
    'r_gelaende', // Gelände am Haus / Außengelände
    'r_aktivitaeten_umgebung',
    'r_lage',
    'r_aussicht',
    'r_zustand',
] as const;

/** Gesamtnote = Mittel der gesetzten (>0) Kriterien, auf 2 Stellen gerundet. */
export function unterkunftGesamtnote(rec: Record<string, unknown>): number {
    const vals = UNTERKUNFT_KRITERIEN
        .map((k) => Number(rec[k] ?? 0))
        .filter((n) => n > 0);
    if (!vals.length) return 0;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(avg * 100) / 100;
}

/** Editierbare Felder einer Unterkunft (ohne berechnete `gesamtnote`). */
const UNTERKUNFT_FIELDS = [
    'name', 'strasse', 'plz', 'ort', 'land', 'website',
    'kontakt_name', 'kontakt_telefon', 'kontakt_email', 'beschreibung',
    'kapazitaet', 'rezension', 'bewertet_von_name', 'bewertet_von_id',
    'bewertet_am', ...UNTERKUNFT_KRITERIEN,
];

/** Übernimmt nur erlaubte Felder + berechnet `gesamtnote` serverseitig. */
export function pickUnterkunft(body: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of UNTERKUNFT_FIELDS) {
        if (body?.[f] !== undefined) out[f] = body[f];
    }
    out.gesamtnote = unterkunftGesamtnote({ ...out });
    return out;
}

/** Legt die `unterkuenfte`-Collection an, falls sie noch nicht existiert. */
export async function ensureUnterkuenfte(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('unterkuenfte');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    await createCollection(pb, 'unterkuenfte', [
        { name: 'name', type: 'text', required: true },
        { name: 'strasse', type: 'text' },
        { name: 'plz', type: 'text' },
        { name: 'ort', type: 'text' },
        { name: 'land', type: 'text' },
        { name: 'website', type: 'text' },
        { name: 'kontakt_name', type: 'text' },
        { name: 'kontakt_telefon', type: 'text' },
        { name: 'kontakt_email', type: 'text' },
        { name: 'beschreibung', type: 'text' },
        { name: 'kapazitaet', type: 'number' },
        { name: 'rezension', type: 'text' },
        { name: 'bewertet_von_name', type: 'text' },
        { name: 'bewertet_von_id', type: 'text' },
        { name: 'bewertet_am', type: 'text' },
        ...UNTERKUNFT_KRITERIEN.map((k) => ({ name: k, type: 'number' as const })),
        { name: 'gesamtnote', type: 'number' },
    ]);
}

/** Legt die `unterkunft_bilder`-Collection an (Bilder als Base64-Text). */
export async function ensureUnterkunftBilder(pb: PocketBase): Promise<void> {
    try {
        await pb.collections.getOne('unterkunft_bilder');
        return;
    } catch (e: any) {
        if (e?.status && e.status !== 404) throw e;
    }
    // Wie bei `protocols`: KEIN Datei-Feld (auf älterem PocketBase problematisch),
    // Bild als Base64-Data-URL in einem Textfeld.
    await createCollection(pb, 'unterkunft_bilder', [
        { name: 'unterkunft', type: 'text', required: true },
        { name: 'name', type: 'text' },
        { name: 'bild_b64', type: 'text' },
        { name: 'sort_order', type: 'number' },
    ]);
}

/**
 * CT-Personen-ID des angemeldeten Nutzers ermitteln (für Gruppen-/Rollen-
 * Prüfungen). Erst schneller Namens-Treffer in `members.ct_id`, sonst über
 * die ChurchTools-Personensuche (Name + E-Mail-Abgleich).
 */
export async function resolvePersonId(
    pb: PocketBase,
    user: { name?: string; email?: string } | null,
): Promise<string | null> {
    const nm = (user?.name || '').toString().trim();
    if (!nm) return null;
    try {
        const m = await pb.collection('members').getFirstListItem(`name="${nm}"`);
        if (m?.ct_id) return String(m.ct_id);
    } catch (_) { /* kein PB-Treffer */ }
    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = env.CHURCHTOOLS_TOKEN;
        if (!base || !token) return null;
        const client = new ChurchToolsClient(base, token);
        const r: any = await client.request(
            `persons?query=${encodeURIComponent(nm)}&limit=25`);
        const list: any[] = r.data || [];
        const email = (user?.email || '').toString().toLowerCase();
        let hit = email
            ? list.find((p) => (p.email || '').toString().toLowerCase() === email)
            : null;
        hit ??= list.find((p) =>
            `${p.firstName || ''} ${p.lastName || ''}`.trim().toLowerCase()
                === nm.toLowerCase());
        if (!hit && list.length === 1) hit = list[0];
        if (hit) return String(hit.id ?? hit.domainIdentifier);
    } catch (_) { /* ignore */ }
    return null;
}

/**
 * Darf der Nutzer Jugendfreizeiten bearbeiten? Admins immer, sonst nur
 * Leiter/Co-Leiter der CT-Gruppe „Jugend" (= Jugendleitung). Fällt bei
 * Fehlern restriktiv aus (false), außer Admin.
 */
export async function isJugendLeitung(
    user: { id: string; role?: string; name?: string; email?: string } | null,
): Promise<boolean> {
    if (!user) return false;
    try {
        const pb = await adminPb();
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        const role = effectiveRole(user.id, user.role, roleMap);
        if (role === 'admin') return true;

        const personId = await resolvePersonId(pb, user);
        if (!personId) return false;

        const base = env.CHURCHTOOLS_BASE_URL;
        const token = env.CHURCHTOOLS_TOKEN;
        if (!base || !token) return false;
        const client = new ChurchToolsClient(base, token);

        // Leiter-Rollen der Gruppe ermitteln (groupTypeRoleId mit isLeader).
        const g: any = await client.request(`groups/${JUGEND_GROUP_ID}`);
        const roles: any[] = (g.data?.roles) || g.roles || [];
        const leaderRoleIds = new Set(
            roles.filter((r) => r.isLeader === true || r.type === 'leader')
                .map((r) => Number(r.groupTypeRoleId ?? r.id)));

        const mem: any = await client.request(
            `groups/${JUGEND_GROUP_ID}/members?limit=200`);
        for (const m of (mem.data || [])) {
            const pid = String(m.personId ?? m.person?.domainIdentifier ?? '');
            if (pid !== String(personId)) continue;
            const rid = Number(m.groupTypeRoleId ?? m.groupMemberRoleId ?? -1);
            if (leaderRoleIds.has(rid)) return true;
        }
        return false;
    } catch {
        return false;
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

/**
 * Zentrale KI-Konfiguration (app_config `llm_config`): an/aus + eigener
 * API-Schlüssel. enabled default true; effektiver Schlüssel = eigener Key,
 * sonst Server-Key (env.GEMINI_API_KEY).
 */
export async function getLlmConfig(
    pb: PocketBase,
): Promise<{ enabled: boolean; key: string }> {
    try {
        const cfg = await getConfig(pb, 'llm_config');
        const enabled = !(cfg && cfg.enabled === false);
        const key = ((cfg?.apiKey || '').toString()) || (env.GEMINI_API_KEY || '');
        return { enabled, key };
    } catch {
        return { enabled: true, key: env.GEMINI_API_KEY || '' };
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

/**
 * Einmalige, idempotente Migration: vereint die getrennten Töpfe
 * `bruderrat_agendas` (Planung) und `bruderrat_agenda_protocols` (Protokoll)
 * zu EINEM Lebenszyklus-Datensatz pro Sitzung in `bruderrat_meetings`
 * (status: 'geplant' | 'protokolliert'). Protokoll gewinnt pro Datum
 * (spätere Phase, vollständiger). Läuft genau einmal (Flag).
 */
export async function ensureBruderratMeetings(pb: PocketBase): Promise<void> {
    const migrated = await getConfig(pb, 'bruderrat_meetings_migrated');
    if (migrated === true) return;

    const asList = (v: any) => (Array.isArray(v) ? v : []);
    const agendas = asList(await getConfig(pb, 'bruderrat_agendas'));
    const protos = asList(await getConfig(pb, 'bruderrat_agenda_protocols'));
    const existing = asList(await getConfig(pb, 'bruderrat_meetings'));

    const byKey = new Map<string, any>();
    const keyOf = (m: any) => ((m?.date || '').toString() || m?.id || genId());

    for (const m of existing) byKey.set(keyOf(m), m);
    for (const a of agendas) {
        const k = keyOf(a);
        if (!byKey.has(k)) byKey.set(k, { ...a, status: 'geplant' });
    }
    // Protokoll überschreibt die Agenda desselben Datums.
    for (const p of protos) byKey.set(keyOf(p), { ...p, status: 'protokolliert' });

    const merged = [...byKey.values()].map((m) => ({
        ...m,
        id: m.id || genId(),
        status: m.status || 'geplant',
        createdAt: m.createdAt || new Date().toISOString(),
    }));
    merged.sort((a, b) =>
        (b?.date || '').toString().localeCompare((a?.date || '').toString()));

    await setConfig(pb, 'bruderrat_meetings', merged);
    await setConfig(pb, 'bruderrat_meetings_migrated', true);
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
    // Neue Struktur-Bereiche (z. B. „jugend") sind standardmäßig sichtbar, auch
    // wenn die gespeicherte Matrix sie (mangels Existenz) noch nicht kennt.
    const menus = Array.isArray(s.menus)
        ? [...new Set([
            ...s.menus.map((m) => (m === 'besprechungen' ? 'bruderrat' : m)),
            'jugend',
        ])]
        : def.menus;
    return {
        menus,
        churchtools: typeof s.churchtools === 'boolean' ? s.churchtools : def.churchtools,
        berechtigungen:
            typeof s.berechtigungen === 'boolean' ? s.berechtigungen : def.berechtigungen,
        konfiguration:
            typeof s.konfiguration === 'boolean' ? s.konfiguration : def.konfiguration,
        dienstplaner:
            typeof s.dienstplaner === 'boolean' ? s.dienstplaner : def.dienstplaner,
    };
}

/**
 * Darf der Nutzer Dienstpläne bearbeiten? Admins immer, sonst nur Rollen mit
 * gesetztem `dienstplaner`-Recht. Fällt bei Fehlern offen aus (kein Lockout,
 * falls der Backend-Admin nicht erreichbar ist).
 */
export async function canEditPlans(
    user: { id: string; role?: string } | null,
): Promise<boolean> {
    if (!user) return false;
    try {
        const pb = await adminPb();
        const roleMap = (await getConfig(pb, 'user_roles')) || {};
        const rolePerms = (await getConfig(pb, 'role_perms')) || {};
        const role = effectiveRole(user.id, user.role, roleMap);
        if (role === 'admin') return true;
        return permsForRole(role, rolePerms).dienstplaner === true;
    } catch {
        return true;
    }
}
