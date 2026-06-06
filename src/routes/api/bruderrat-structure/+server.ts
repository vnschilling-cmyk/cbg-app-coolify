/**
 * KI-Strukturierung eines Protokoll-Freitexts in Tagesordnungspunkte (TOPs).
 *
 * Eigener Pfad (NICHT unter /api/bruderrat/, sonst Kollision mit der
 * dynamischen Route /api/bruderrat/[kind]).
 *
 *   POST /api/bruderrat-structure   { text }
 *     -> { tops: [{ title, points: [{ text, name }] }] }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { geminiStructure } from '$lib/server/admin';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const text = (body?.text || '').toString();
        if (!text.trim()) return json({ tops: [] });
        if (!env.GEMINI_API_KEY) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const res = await geminiStructure(text, env.GEMINI_API_KEY);
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'Strukturierung fehlgeschlagen' }, 500);
    }
}
