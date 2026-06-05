/**
 * POST /api/protocols/[id]/extract
 * Extrahiert per KI Beschlüsse + Aufgaben aus einem Protokoll und übernimmt
 * sie in die Bruderrat-Sammlungen (app_config: bruderrat_decisions/tasks).
 * Antwort: { decisions: n, tasks: n }.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureAppConfig,
    extractDocxText,
    geminiExtract,
    getConfig,
    setConfig,
    genId,
} from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request, params }) {
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const key = env.GEMINI_API_KEY;
        if (!key) return json({ error: 'Kein Gemini-API-Key konfiguriert.' }, 400);

        const pb = await adminPb();
        await ensureAppConfig(pb);
        const rec = await pb.collection('protocols').getOne(params.id);

        // Bevorzugt die überarbeitete Fassung, sonst Rohtext, sonst aus b64.
        let text: string = (rec.reworked_text || rec.original_text || '').toString();
        if (!text && rec.original_b64) {
            text = extractDocxText(Buffer.from(rec.original_b64, 'base64'));
        }
        if (!text.trim()) {
            return json({ error: 'Kein Text zum Auswerten vorhanden.' }, 422);
        }

        const { decisions, tasks } = await geminiExtract(text, key);
        const date = (rec.date || '').toString();
        const source = (rec.title || '').toString();
        const now = new Date().toISOString();

        // Beschlüsse anhängen.
        const decList = ((await getConfig(pb, 'bruderrat_decisions')) as any[]) || [];
        const decArr = Array.isArray(decList) ? decList : [];
        let dn = 0;
        for (const d of decisions) {
            const title = (d?.title || d?.text || '').toString().trim();
            if (!title) continue;
            decArr.unshift({
                id: genId(),
                title,
                text: (d?.text || '').toString(),
                date,
                status: 'offen',
                source,
                sourceId: rec.id,
                createdAt: now,
            });
            dn++;
        }
        if (dn) await setConfig(pb, 'bruderrat_decisions', decArr);

        // Aufgaben anhängen.
        const taskList = ((await getConfig(pb, 'bruderrat_tasks')) as any[]) || [];
        const taskArr = Array.isArray(taskList) ? taskList : [];
        let tn = 0;
        for (const tk of tasks) {
            const title = (tk?.title || '').toString().trim();
            if (!title) continue;
            taskArr.unshift({
                id: genId(),
                title,
                assignee: (tk?.assignee || '').toString(),
                due: (tk?.due || '').toString(),
                notes: '',
                done: false,
                source,
                sourceId: rec.id,
                createdAt: now,
            });
            tn++;
        }
        if (tn) await setConfig(pb, 'bruderrat_tasks', taskArr);

        return json({ decisions: dn, tasks: tn });
    } catch (e: any) {
        console.error('POST extract:', e?.message || e);
        return json({ error: e?.message || 'Extraktion fehlgeschlagen' }, 500);
    }
}
