/**
 * Schnell-Erfassung: gesprochenen/getippten Gedanken per KI aufbereiten und
 * das Ziel bestimmen (nächste Agenda vs. Themen-Pool).
 *
 *   POST /api/bruderrat-capture   { text }
 *     -> { kind: 'agenda'|'theme', title, text }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { geminiCapture } from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const text = (body?.text || '').toString();
        if (!text.trim()) return json({ error: 'Kein Text übermittelt' }, 400);
        const res = await geminiCapture(text, env.GEMINI_API_KEY || '');
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'Auswertung fehlgeschlagen' }, 500);
    }
}
