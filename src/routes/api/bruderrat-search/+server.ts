/**
 * Bereichsübergreifende Suche im Bruderrat (Agenda, Protokolle, Beschlüsse,
 * Aufgaben). Kombiniert lokale Volltextsuche mit optionaler Gemini-KI-Suche
 * inkl. Kurz-Zusammenfassung.
 *
 * Eigener Pfad (NICHT unter /api/bruderrat/, sonst Kollision mit der
 * dynamischen Route /api/bruderrat/[kind]).
 *
 *   POST /api/bruderrat-search   { q, kinds?: string[] }
 *     -> { matches: [{ kind, id, title, date, snippet }], summary, ai }
 *
 * `kinds` filtert die durchsuchten Bereiche (Default: alle).
 * Daten: app_config (agendas/decisions/tasks) + Collection `protocols`.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureAppConfig, ensureProtocols, ensureBruderratMeetings,
    getConfig, geminiSearch,
} from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

const ALL_KINDS = ['meetings', 'protocols', 'decisions', 'tasks', 'themes'];

/** Sammelt rekursiv alle String-Werte eines Objekts (für Volltext). */
function collectStrings(v: any, out: string[] = [], depth = 0): string[] {
    if (depth > 6 || v == null) return out;
    if (typeof v === 'string') {
        if (v.trim()) out.push(v);
    } else if (Array.isArray(v)) {
        for (const x of v) collectStrings(x, out, depth + 1);
    } else if (typeof v === 'object') {
        for (const k of Object.keys(v)) {
            if (k === 'id' || k === 'personId' || k === 'assigneeId') continue;
            collectStrings(v[k], out, depth + 1);
        }
    }
    return out;
}

type Entry = {
    kind: string; id: string; title: string; date: string;
    text: string; snippet: string;
};

async function buildCorpus(pb: any, kinds: string[]): Promise<Entry[]> {
    const entries: Entry[] = [];

    if (kinds.includes('meetings')) {
        await ensureBruderratMeetings(pb);
        const list = (await getConfig(pb, 'bruderrat_meetings')) || [];
        for (const a of Array.isArray(list) ? list : []) {
            const date = (a?.date || '').toString();
            const text = collectStrings(a).join(' · ');
            const label = (a?.status === 'protokolliert') ? 'Protokoll' : 'Agenda';
            entries.push({
                kind: 'meetings', id: (a?.id || '').toString(),
                title: date ? `${date} ${label}` : (a?.title || 'Sitzung').toString(),
                date, text, snippet: text.slice(0, 200),
            });
        }
    }
    if (kinds.includes('decisions')) {
        const list = (await getConfig(pb, 'bruderrat_decisions')) || [];
        for (const d of Array.isArray(list) ? list : []) {
            const text = [d?.title, d?.text].filter(Boolean).join(' — ');
            entries.push({
                kind: 'decisions', id: (d?.id || '').toString(),
                title: (d?.title || 'Beschluss').toString(),
                date: (d?.date || '').toString(),
                text, snippet: (d?.text || d?.title || '').toString().slice(0, 200),
            });
        }
    }
    if (kinds.includes('tasks')) {
        const list = (await getConfig(pb, 'bruderrat_tasks')) || [];
        for (const t of Array.isArray(list) ? list : []) {
            const text = [t?.title, t?.notes, t?.assignee].filter(Boolean).join(' — ');
            entries.push({
                kind: 'tasks', id: (t?.id || '').toString(),
                title: (t?.title || 'Aufgabe').toString(),
                date: (t?.due || '').toString(),
                text, snippet: (t?.notes || t?.title || '').toString().slice(0, 200),
            });
        }
    }
    if (kinds.includes('themes')) {
        const list = (await getConfig(pb, 'bruderrat_themes')) || [];
        for (const th of Array.isArray(list) ? list : []) {
            const text = [th?.title, th?.text].filter(Boolean).join(' — ');
            entries.push({
                kind: 'themes', id: (th?.id || '').toString(),
                title: (th?.title || 'Thema').toString(),
                date: (th?.date || '').toString(),
                text, snippet: (th?.text || th?.title || '').toString().slice(0, 200),
            });
        }
    }
    if (kinds.includes('protocols')) {
        try {
            await ensureProtocols(pb);
            const list = await pb.collection('protocols').getFullList({ sort: '-id' });
            for (const p of list) {
                const body = ((p as any).reworked_text || (p as any).original_text || '')
                    .toString();
                entries.push({
                    kind: 'protocols', id: (p as any).id,
                    title: ((p as any).title || 'Protokoll').toString(),
                    date: ((p as any).date || '').toString(),
                    text: `${(p as any).title || ''} ${body}`,
                    snippet: body.replace(/\s+/g, ' ').slice(0, 200),
                });
            }
        } catch { /* Protokolle optional */ }
    }
    return entries;
}

function localMatch(q: string, entries: Entry[]): Entry[] {
    const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    const scored: { e: Entry; score: number }[] = [];
    for (const e of entries) {
        const hay = `${e.title} ${e.text}`.toLowerCase();
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score++;
        if (score > 0) scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.e);
}

function publicShape(e: Entry) {
    return { kind: e.kind, id: e.id, title: e.title, date: e.date, snippet: e.snippet };
}

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const q = (body?.q || '').toString().trim();
        if (!q) return json({ matches: [], summary: '', ai: false });
        const reqKinds: string[] = Array.isArray(body?.kinds) && body.kinds.length
            ? body.kinds.filter((k: any) => ALL_KINDS.includes(k))
            : ALL_KINDS;

        const pb = await adminPb();
        await ensureAppConfig(pb);
        const corpus = await buildCorpus(pb, reqKinds);
        const byId = new Map<string, Entry>(corpus.map((e): [string, Entry] => [e.id, e]));

        // Lokale Volltextsuche als Basis (immer vorhanden).
        const local = localMatch(q, corpus);

        // KI-Suche (best effort) – ergänzt Reihenfolge + Zusammenfassung.
        let summary = '';
        let ai = false;
        const ordered: Entry[] = [];
        const seen = new Set<string>();
        if (env.GEMINI_API_KEY) {
            try {
                const res = await geminiSearch(q, corpus, env.GEMINI_API_KEY);
                summary = res.summary || '';
                ai = true;
                for (const id of res.matchIds) {
                    const e = byId.get(id);
                    if (e && !seen.has(id)) { ordered.push(e); seen.add(id); }
                }
            } catch { /* Fallback unten */ }
        }
        // Lokale Treffer anhängen (die KI nicht schon nannte).
        for (const e of local) {
            if (!seen.has(e.id)) { ordered.push(e); seen.add(e.id); }
        }

        return json({ matches: ordered.map(publicShape), summary, ai });
    } catch (e: any) {
        return json({ error: e?.message || 'Suche fehlgeschlagen' }, 500);
    }
}
