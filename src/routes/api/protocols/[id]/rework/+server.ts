/**
 * POST /api/protocols/[id]/rework – (erneut) per Gemini auswerten.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    extractDocxText,
    geminiRework,
    geminiReworkPdf,
    getActivePrompt,
    getLlmConfig,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request, params }) {
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const pb = await adminPb();
        const llm = await getLlmConfig(pb);
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        const key = llm.key;
        if (!key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 400);
        }

        const rec = await pb.collection('protocols').getOne(params.id);
        const tmpl = await getActivePrompt(pb);
        const isPdf = (rec.file_name || '').toLowerCase().endsWith('.pdf');

        // PDF: ohne extrahierten Text direkt das PDF an Gemini geben.
        if (isPdf && !(rec.original_text || '').trim() && rec.original_b64) {
            const reworked = await geminiReworkPdf(rec.original_b64, key, tmpl);
            const update = {
                reworked_text: reworked.slice(0, 1900000),
                status: 'fertig',
            };
            await pb.collection('protocols').update(rec.id, update);
            return json({ success: true, reworkedText: update.reworked_text });
        }

        let text: string = rec.original_text || '';
        if (!text && rec.original_b64) {
            text = extractDocxText(Buffer.from(rec.original_b64, 'base64'));
        }
        if (!text.trim()) {
            await pb.collection('protocols').update(rec.id, { status: 'kein_text' });
            return json({ error: 'Kein Text aus dem Dokument extrahierbar.' }, 422);
        }

        const reworked = await geminiRework(text, key, tmpl);
        const update = {
            original_text: text.slice(0, 1900000),
            reworked_text: reworked.slice(0, 1900000),
            status: 'fertig',
        };
        await pb.collection('protocols').update(rec.id, update);
        return json({ success: true, reworkedText: update.reworked_text });
    } catch (e: any) {
        console.error('POST rework:', e?.message || e);
        return json({ error: e?.message || 'Auswertung fehlgeschlagen' }, 500);
    }
}
