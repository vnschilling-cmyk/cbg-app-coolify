import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { computeExportDeletions } from '$lib/server/editor-core';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * POST /api/editor/{id}/deletions
 * Vorschau: Ermittelt verwaiste CT-Zuweisungen (Plan-Prediger + Plan-Dienste,
 * die im Grid nicht mehr stehen). Löscht NICHTS – nur Kandidaten zur Bestätigung.
 * Body: { data: { slotId: { name: code } } }
 */
export const POST: RequestHandler = async ({ request }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert', deletions: [] }, 401);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body', deletions: [] }, 400);
    }
    if (!body || typeof body.data !== 'object') {
        return json({ success: false, error: 'Keine Grid-Daten', deletions: [] }, 400);
    }

    try {
        const deletions = await computeExportDeletions(pb, user, body.data);
        return json({ success: true, deletions });
    } catch (e: any) {
        console.error('API editor deletions preview failed:', e);
        return json(
            { success: false, error: e?.message || 'Vorschau fehlgeschlagen', deletions: [] },
            500,
        );
    }
};
