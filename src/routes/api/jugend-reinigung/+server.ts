import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { canEditPlans } from '$lib/server/admin';
import { loadJugendReinigungsplan } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/jugend-reinigung?from=&to= -> Reinigungsplan (Kalender 86, Dienst 113). */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadJugendReinigungsplan(
            user,
            url.searchParams.get('from') || undefined,
            url.searchParams.get('to') || undefined,
        );
        return json({ ...data, canEdit: await canEditPlans(user) });
    } catch (e: any) {
        console.error('API jugend-reinigung failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
