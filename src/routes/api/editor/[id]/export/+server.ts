import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { exportPlanData } from '$lib/server/editor-core';
import { canEditPlans } from '$lib/server/admin';

export const OPTIONS: RequestHandler = async () => preflight();

/** POST /api/editor/{id}/export -> Dienste nach ChurchTools schreiben. */
export const POST: RequestHandler = async ({ request }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ success: false, error: 'Nicht autorisiert', results: [] }, 401);
    }
    if (!(await canEditPlans(user))) {
        return json(
            { success: false, error: 'Keine Berechtigung, Dienstpläne zu bearbeiten', results: [] },
            403);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body', results: [] }, 400);
    }
    if (!body || typeof body.data !== 'object') {
        return json(
            { success: false, error: 'Keine Daten zum Exportieren', results: [] },
            400,
        );
    }

    try {
        const results = await exportPlanData(pb, user, body.data);
        return json({ success: true, message: 'Export abgeschlossen', results });
    } catch (e: any) {
        console.error('API editor export failed:', e);
        return json(
            { success: false, error: e?.message || 'Export fehlgeschlagen', results: [] },
            500,
        );
    }
};
