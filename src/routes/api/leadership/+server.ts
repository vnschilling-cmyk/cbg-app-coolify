import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadLeadership } from '$lib/server/leadership';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/leadership?from=&to= -> Zusammenfassung für die Gottesdienstleitung. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadLeadership(
            user,
            url.searchParams.get('from') || undefined,
            url.searchParams.get('to') || undefined,
        );
        return json(data);
    } catch (e: any) {
        console.error('API leadership failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
