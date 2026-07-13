/**
 * Rohtext-Aufbereitung per KI (Diktat → Beschreibung).
 *
 *   POST /api/ki-text  { text, kontext? }
 *     -> { text: '<aufbereiteter Text>' }
 */
import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { adminPb, geminiTidyText, getLlmConfig } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    const text = ((body?.text ?? '').toString()).trim();
    const kontext = ((body?.kontext ?? '').toString()).trim();
    if (!text) return json({ error: 'Kein Text übermittelt' }, 400);
    try {
        const llm = await getLlmConfig(await adminPb());
        if (!llm.enabled) {
            return json({ error: 'KI ist in den Einstellungen deaktiviert.' }, 503);
        }
        if (!llm.key) {
            return json({ error: 'Kein KI-Schlüssel konfiguriert.' }, 503);
        }
        const out = await geminiTidyText(text, llm.key, kontext);
        return json({ text: out });
    } catch (e: any) {
        console.error('POST /api/ki-text failed:', e?.message || e);
        return json({ error: e?.message || 'KI-Aufbereitung fehlgeschlagen' }, 500);
    }
};
