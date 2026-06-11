import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { computeImport } from '$lib/server/editor-core';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * POST /api/editor/{id}/import
 * Vorschau: liest die ChurchTools-Zuweisungen im Plan-Zeitfenster und gleicht
 * sie mit dem aktuellen Grid ab. Verändert NICHTS – liefert nur die Kandidaten
 * (neu/Konflikt) zur Bestätigung; das Übernehmen passiert im Client am Grid.
 * Body: { data: { slotId: { name: code } }, from, to, slots: [{id, calendarId}] }
 */
export const POST: RequestHandler = async ({ request }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert', candidates: [] }, 401);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body', candidates: [] }, 400);
    }
    const data = (body?.data && typeof body.data === 'object') ? body.data : {};
    const from = (body?.from || '').toString();
    const to = (body?.to || '').toString();
    const slots = Array.isArray(body?.slots) ? body.slots : [];
    if (!from || !to || !slots.length) {
        return json(
            { success: false, error: 'Zeitraum oder Spalten fehlen', candidates: [] },
            400,
        );
    }

    try {
        const candidates = await computeImport(pb, user, data, from, to, slots);
        return json({ success: true, candidates });
    } catch (e: any) {
        console.error('API editor import preview failed:', e);
        return json(
            { success: false, error: e?.message || 'Import-Vorschau fehlgeschlagen', candidates: [] },
            500,
        );
    }
};
