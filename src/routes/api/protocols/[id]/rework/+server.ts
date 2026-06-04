/**
 * POST /api/protocols/[id]/rework – (erneut) per Gemini auswerten.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb,
    extractDocxText,
    geminiRework,
    getActivePrompt,
} from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request, params }) {
    try {
        const { user } = await pbFromRequest(request);
        if (!user) return json({ error: 'Unauthorized' }, 401);

        const key = env.GEMINI_API_KEY;
        if (!key) {
            return json({ error: 'Kein Gemini-API-Key konfiguriert.' }, 400);
        }

        const pb = await adminPb();
        const rec = await pb.collection('protocols').getOne(params.id);

        let text: string = rec.original_text || '';
        if (!text && rec.original_b64) {
            text = extractDocxText(Buffer.from(rec.original_b64, 'base64'));
        }
        if (!text.trim()) {
            await pb.collection('protocols').update(rec.id, { status: 'kein_text' });
            return json({ error: 'Kein Text aus dem Dokument extrahierbar.' }, 422);
        }

        const tmpl = await getActivePrompt(pb);
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
