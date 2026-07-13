import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadJugendStatistik } from '$lib/server/jugend';

export const OPTIONS: RequestHandler = async () => preflight();

/**
 * GET /api/jugend-statistik -> Alters-Statistik der CT-Jugendgruppe (19) aus
 * den ChurchTools-Geburtstagseinträgen.
 *   { mitglieder, mitGeburtstag, ohneGeburtstag, durchschnittsalter,
 *     juengste, aelteste, verteilung: [{ label, count }] }
 */
export const GET: RequestHandler = async ({ request }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const data = await loadJugendStatistik(user);
        return json(data);
    } catch (e: any) {
        console.error('API jugend-statistik failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
