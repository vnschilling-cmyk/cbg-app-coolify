import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { applyExportDeletions } from '$lib/server/editor-core';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * POST /api/editor/{id}/deletions/apply
 * Löscht die ausgewählten Zuweisungen – aber NUR, wenn sie weiterhin gültige
 * Kandidaten sind (serverseitig erneut gegen das Grid geprüft).
 * Body: { data: { slotId: { name: code } }, deletions: [{ eventId, eventServiceId }] }
 */
export const POST: RequestHandler = async ({ request }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert', results: [] }, 401);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body', results: [] }, 400);
    }
    if (!body || typeof body.data !== 'object' || !Array.isArray(body.deletions)) {
        return json(
            { success: false, error: 'Grid-Daten oder Lösch-Liste fehlen', results: [] },
            400,
        );
    }

    try {
        const results = await applyExportDeletions(pb, user, body.data, body.deletions);
        return json({ success: true, message: 'Löschung abgeschlossen', results });
    } catch (e: any) {
        console.error('API editor deletions apply failed:', e);
        return json(
            { success: false, error: e?.message || 'Löschung fehlgeschlagen', results: [] },
            500,
        );
    }
};
