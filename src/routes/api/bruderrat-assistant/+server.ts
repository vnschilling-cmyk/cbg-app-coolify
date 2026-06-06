/**
 * KI-Sekretär: beantwortet eine Anfrage über den gesamten Bruderrat-Content
 * und schlägt ausführbare Aktionen vor (vom Client nach Bestätigung angelegt).
 *
 *   POST /api/bruderrat-assistant   { q }
 *     -> { answer, actions: [{type,title,text,channel}] }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, ensureAppConfig, ensureProtocols, ensureBruderratMeetings,
    getConfig, geminiAssistant, getLlmConfig,
} from '$lib/server/admin';

// Hinweis: KI-Routen (#81 Assistant, #82 TTS) brauchen einen frischen
// Backend-Deploy, um live zu sein.
export const OPTIONS = async () => preflight();

function clip(s: any, n: number): string {
    return (s ?? '').toString().replace(/\s+/g, ' ').trim().slice(0, n);
}

async function buildCorpus(pb: any): Promise<string> {
    const lines: string[] = [];
    const asList = (v: any) => (Array.isArray(v) ? v : []);

    await ensureBruderratMeetings(pb);
    for (const m of asList(await getConfig(pb, 'bruderrat_meetings'))) {
        const tops = asList(m?.items)
            .map((it: any) => clip(it?.title, 60))
            .filter(Boolean)
            .join('; ');
        lines.push(`[Sitzung ${clip(m?.date, 10)} ${m?.status === 'protokolliert' ? 'Protokoll' : 'Agenda'}] ${clip(tops, 300)}`);
    }
    for (const d of asList(await getConfig(pb, 'bruderrat_decisions'))) {
        lines.push(`[Beschluss] ${clip(d?.title, 120)} — ${clip(d?.text, 200)}`);
    }
    for (const tk of asList(await getConfig(pb, 'bruderrat_tasks'))) {
        lines.push(`[Aufgabe${tk?.done ? ' erledigt' : ''}] ${clip(tk?.title, 120)}${tk?.assignee ? ` (${clip(tk.assignee, 40)})` : ''}`);
    }
    for (const th of asList(await getConfig(pb, 'bruderrat_themes'))) {
        lines.push(`[Thema] ${clip(th?.title, 120)} — ${clip(th?.text, 160)}`);
    }
    for (const i of asList(await getConfig(pb, 'bruderrat_infos'))) {
        lines.push(`[Info ${clip(i?.channel, 20)}] ${clip(i?.title, 160)}`);
    }
    try {
        await ensureProtocols(pb);
        const protos = await pb.collection('protocols').getFullList({ sort: '-id' });
        for (const p of protos) {
            const body = (p as any).reworked_text || (p as any).original_text || '';
            lines.push(`[Protokoll ${clip((p as any).date, 10)}] ${clip(body, 400)}`);
        }
    } catch { /* optional */ }

    // Gesamtgröße begrenzen (Token-Budget).
    return lines.join('\n').slice(0, 60000);
}

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const q = (body?.q || '').toString().trim();
        if (!q) return json({ answer: '', actions: [] });

        const pb = await adminPb();
        await ensureAppConfig(pb);
        const llm = await getLlmConfig(pb);
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const corpus = await buildCorpus(pb);
        const res = await geminiAssistant(q, corpus, llm.key);
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'Assistent fehlgeschlagen' }, 500);
    }
}
