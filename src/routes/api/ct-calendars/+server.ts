import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';

export const OPTIONS: RequestHandler = async () => preflight();

/** GET /api/ct-calendars -> Liste aller Termin-Kalender aus ChurchTools. */
export const GET: RequestHandler = async ({ request }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
        const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
        const cals = await client.getCalendars();
        const calendars = cals.map((c: any) => ({
            id: String(c.id),
            name: c.name || c.nameTranslated || `Kalender ${c.id}`,
            color: c.color || null,
        }));
        return json({ calendars });
    } catch (e: any) {
        console.error('API ct-calendars failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
