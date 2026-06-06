/**
 * Schnell-Erfassung: gesprochenen/getippten Gedanken per KI aufbereiten und
 * das Ziel bestimmen (nächste Agenda vs. Themen-Pool).
 *
 *   POST /api/bruderrat-capture   { text }
 *     -> { kind: 'agenda'|'theme', title, text }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, geminiCapture, getLlmConfig } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const text = (body?.text || '').toString();
        if (!text.trim()) return json({ error: 'Kein Text übermittelt' }, 400);
        // KI aus oder kein Key → Fallback (Rohtext als Thema), Erfassung läuft.
        const llm = await getLlmConfig(await adminPb());
        const res = await geminiCapture(text, llm.enabled ? llm.key : '');
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'Auswertung fehlgeschlagen' }, 500);
    }
}
