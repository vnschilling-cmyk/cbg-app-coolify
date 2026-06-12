/**
 * KI: aus dem Diskussionsverlauf eines Punkts Beschluss- und Mitteilungstexte
 * ableiten (Vorschläge, manuell anpassbar).
 *
 *   POST /api/bruderrat-summarize   { pointText, discussion: [{name,text}] }
 *     -> { beschluss, mitteilungKurz, mitteilungLang }
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, geminiProtocolTexts, getLlmConfig } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    try {
        let body: any;
        try {
            body = await request.json();
        } catch {
            body = {};
        }
        const pointText = (body?.pointText || '').toString();
        const discussion = Array.isArray(body?.discussion) ? body.discussion : [];
        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const res = await geminiProtocolTexts(pointText, discussion, llm.key);
        return json(res);
    } catch (e: any) {
        return json({ error: e?.message || 'KI-Vorschlag fehlgeschlagen' }, 500);
    }
}
