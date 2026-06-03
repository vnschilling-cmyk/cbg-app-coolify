import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadEditorData } from '$lib/server/editor-core';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/editor/{id} -> komplette Editor-Daten für die Flutter-App. */
export const GET: RequestHandler = async ({ params, request }) => {
    const { pb, user } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadEditorData(pb, user, params.id);
        return json(data);
    } catch (e: any) {
        console.error('API editor load failed:', e);
        const status = e?.status === 404 ? 404 : 500;
        return json(
            { error: e?.message || 'Editor-Daten konnten nicht geladen werden' },
            status,
        );
    }
};
