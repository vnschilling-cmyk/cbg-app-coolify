import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { savePlanData } from '$lib/server/editor-core';

export const OPTIONS: RequestHandler = async () => preflight();

/** POST /api/editor/{id}/save -> Grid-Daten speichern. */
export const POST: RequestHandler = async ({ params, request }) => {
    const { pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert' }, 401);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body' }, 400);
    }
    if (!body || typeof body.data !== 'object') {
        return json({ success: false, error: 'Keine Daten zum Speichern' }, 400);
    }

    try {
        await savePlanData(pb, params.id, body);
        return json({ success: true });
    } catch (e: any) {
        console.error('API editor save failed:', e);
        return json({ success: false, error: e?.message || 'Speichern fehlgeschlagen' }, 500);
    }
};
