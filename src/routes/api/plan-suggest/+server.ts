/**
 * POST /api/plan-suggest  { prompt, context }
 * KI-gestützter Dienstplan-Vorschlag. Der Client liefert den Kontext inkl.
 * bereits nach harten Regeln gefilterter Kandidatenlisten je (Slot, Code);
 * die KI wählt NUR daraus und beachtet die Freitext-Wünsche + Ziel-Anzahlen.
 * Rückgabe: { assignments: [{slotId, code, preacher}], hinweise }.
 *
 * Die harten Regeln werden zusätzlich clientseitig erzwungen – dieser Endpunkt
 * ist die „weiche" Schicht.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, getLlmConfig, geminiSuggestPlan } from '$lib/server/admin';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger Body' }, 400);
    }
    const prompt = (body?.prompt ?? '').toString();
    const context = body?.context;
    if (!context || typeof context !== 'object') {
        return json({ error: 'context nötig' }, 400);
    }

    try {
        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);

        const res = await geminiSuggestPlan(context, prompt, llm.key);
        return json(res);
    } catch (e: any) {
        console.error('POST /api/plan-suggest failed:', e?.message || e);
        return json({ error: e?.message || 'KI-Vorschlag fehlgeschlagen' }, 500);
    }
}
