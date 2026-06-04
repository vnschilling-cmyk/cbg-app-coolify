/**
 * Besprechungs-Protokolle.
 *   GET  /api/protocols  -> { protocols: [...] }
 *   POST /api/protocols  (multipart: file) -> erstellt Protokoll mit Original-Datei
 *
 * Die KI-Überarbeitung (Textextraktion + LLM) läuft separat über
 * POST /api/protocols/[id]/rework, sobald ein LLM hinterlegt ist.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    ensureProtocols,
    extractDocxText,
    geminiRework,
    getActivePrompt,
} from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

function mapRecord(r: any) {
    return {
        id: r.id,
        title: r.title || '',
        date: r.date || '',
        status: r.status || 'neu',
        hasFile: !!r.original_b64,
        fileName: r.file_name || '',
        originalText: r.original_text || '',
        reworkedText: r.reworked_text || '',
        created: r.created || '',
    };
}

export async function GET({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        const pb = await adminPb();
        await ensureProtocols(pb);
        // KEIN sort:'-created' — Base-Collections in PB v0.38 haben kein
        // created-Feld; das war die Ursache des 500. Neueste zuerst über id.
        const list = await pb
            .collection('protocols')
            .getFullList({ sort: '-id' });
        return json({ protocols: list.map(mapRecord) });
    } catch (e: any) {
        // PB-Detailfehler (Feldfehler etc.) durchreichen, um die Ursache zu sehen.
        const detail = e?.response?.data ?? e?.response?.message ?? e?.data;
        console.error('GET /api/protocols failed:', e?.message,
            JSON.stringify(e?.response || {}));
        return json({
            error: (e?.message || 'Fehler beim Laden') +
                (detail ? ' | ' + JSON.stringify(detail) : ''),
        }, 500);
    }
}

export async function POST({ request }) {
    // Komplett umschlossen, damit JEDE Antwort die CORS-Header trägt
    // (sonst meldet der Browser nur „Failed to fetch").
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const form = await request.formData();
        const file: any = form.get('file');
        // Kein `instanceof File` (im Node-Runtime evtl. kein globales File):
        // per Duck-Typing prüfen.
        if (!file || typeof file === 'string' ||
            typeof file.arrayBuffer !== 'function') {
            return json({ error: 'Keine Datei übermittelt' }, 400);
        }

        const pb = await adminPb();
        await ensureProtocols(pb);

        const name: string = file.name || 'Protokoll.docx';
        const title = name.replace(/\.[^.]+$/, '');
        const today = new Date().toISOString().slice(0, 10);

        const buf = Buffer.from(await file.arrayBuffer());
        const rec = await pb.collection('protocols').create({
            title,
            date: today,
            status: 'neu',
            file_name: name,
            original_b64: buf.toString('base64'),
        });

        // Auswertung versuchen (Original bleibt in jedem Fall gespeichert).
        const update: any = {};
        try {
            const text = extractDocxText(buf);
            update.original_text = text.slice(0, 1900000);
            const key = env.GEMINI_API_KEY;
            if (key && text.trim()) {
                const tmpl = await getActivePrompt(pb);
                const reworked = await geminiRework(text, key, tmpl);
                update.reworked_text = reworked.slice(0, 1900000);
                update.status = 'fertig';
            } else {
                update.status = key ? 'kein_text' : 'kein_llm';
            }
        } catch (e: any) {
            update.status = 'fehler';
            update.reworked_text = '';
            console.error('Auswertung fehlgeschlagen:', e?.message || e);
        }
        try {
            await pb.collection('protocols').update(rec.id, update);
            Object.assign(rec, update);
        } catch (e: any) {
            console.error('Update nach Auswertung:', e?.message || e);
        }
        return json({ protocol: mapRecord(rec) });
    } catch (e: any) {
        console.error('POST /api/protocols failed:', e?.message || e);
        return json({ error: e?.message || 'Upload fehlgeschlagen' }, 500);
    }
}
