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
import { adminPb, geminiStructure, getLlmConfig } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try { body = await request.json(); } catch { body = {}; }
        const text = (body?.text || '').toString();
        if (!text.trim()) return json({ tops: [] });
        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const res = await geminiStructure(text, llm.key);
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'Strukturierung fehlgeschlagen' }, 500);
    }
}
