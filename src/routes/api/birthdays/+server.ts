import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { loadWeekBirthdays } from '$lib/server/leadership';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/birthdays -> Geburtstage aller Mitglieder in der aktuellen Woche. */
export const GET: RequestHandler = async ({ request }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const birthdays = await loadWeekBirthdays(user);
        return json({ birthdays });
    } catch (e: any) {
        console.error('API birthdays failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
