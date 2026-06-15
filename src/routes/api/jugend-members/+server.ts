import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadJugendGroupMembers } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/jugend-members -> Mitglieder der CT-Jugendgruppe (19). {people}. */
export const GET: RequestHandler = async ({ request }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) return json({ error: 'Nicht autorisiert' }, 401);
    try {
        return json(await loadJugendGroupMembers(user));
    } catch (e: any) {
        console.error('API jugend-members failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
