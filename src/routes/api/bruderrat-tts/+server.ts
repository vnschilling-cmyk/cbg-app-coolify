/**
 * Text-to-Speech: erzeugt aus Text eine WAV-Audiodatei (base64), in allen
 * Browsern per <audio> abspielbar.
 *
 *   POST /api/bruderrat-tts   { text }
 *     -> { audio: <base64-wav>, mime: 'audio/wav' }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, geminiTts, getLlmConfig } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const text = (body?.text || '').toString();
        if (!text.trim()) return json({ error: 'Kein Text' }, 400);
        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist deaktiviert.' }, 503);
        }
        if (!llm.key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const r = await geminiTts(text, llm.key);
        return json({ audio: r.audioBase64, mime: r.mime });
    } catch (e: any) {
        return json({ error: e?.message || 'TTS fehlgeschlagen' }, 500);
    }
}
