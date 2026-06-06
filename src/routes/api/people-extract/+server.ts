/**
 * Personen-Import per KI: Word (.docx) oder PDF hochladen → Gemini extrahiert
 * eine Personenliste.
 *
 *   POST /api/people-extract   { name, b64 }   (oder { text })
 *     -> { people: [{ name, email, group, role, note }] }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import {
    adminPb, extractDocxText, geminiExtractPeople, getLlmConfig,
} from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const name = (body?.name || '').toString().toLowerCase();
        const b64 = (body?.b64 || '').toString();
        const text = (body?.text || '').toString();

        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);

        let parts: any[] = [];
        if (b64 && name.endsWith('.pdf')) {
            parts = [{ inlineData: { mimeType: 'application/pdf', data: b64 } }];
        } else if (b64 && name.endsWith('.docx')) {
            let txt = '';
            try {
                txt = extractDocxText(Buffer.from(b64, 'base64'));
            } catch { /* ignore */ }
            if (!txt.trim()) {
                return json({ error: 'Kein Text aus dem Dokument lesbar.' }, 422);
            }
            parts = [{ text: `--- DOKUMENT ---\n${txt.slice(0, 500000)}` }];
        } else if (text.trim()) {
            parts = [{ text: `--- DOKUMENT ---\n${text.slice(0, 500000)}` }];
        } else {
            return json({ error: 'Nur .docx oder .pdf werden unterstützt.' }, 400);
        }

        const people = await geminiExtractPeople(parts, llm.key);
        return json({ people });
    } catch (e: any) {
        return json({ error: e?.message || 'Extraktion fehlgeschlagen' }, 500);
    }
}
