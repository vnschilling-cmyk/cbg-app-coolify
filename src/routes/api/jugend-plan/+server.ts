import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadJugendPlan } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/jugend-plan?from=&to= -> Jugend-Termine (Kalender 3) inkl. Diensten. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadJugendPlan(
            user,
            url.searchParams.get('from') || undefined,
            url.searchParams.get('to') || undefined,
        );
        return json(data);
    } catch (e: any) {
        console.error('API jugend-plan failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
