import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadJugendPeople } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * GET /api/jugend-people -> Personen zum Zuweisen im Jugend-Dienstplan:
 * alle männlichen Mitglieder + weibliche Klavierspielerinnen. { people:[{name,id}] }.
 */
export const GET: RequestHandler = async ({ request }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadJugendPeople(user);
        return json(data);
    } catch (e: any) {
        console.error('API jugend-people failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
