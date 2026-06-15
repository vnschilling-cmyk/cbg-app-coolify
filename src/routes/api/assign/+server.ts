/**
 * POST /api/assign  { eventId, serviceId, personId }
 * Weist eine Person einem offenen ChurchTools-Dienst-Slot zu und bestätigt
 * direkt (live nach ChurchTools geschrieben). Nur für Dienstplaner/Admin.
 */
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { canEditPlans } from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { env } from '$env/dynamic/private';

export const OPTIONS = async () => preflight();

export async function POST({ request }) {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ success: false, error: 'Unauthorized' }, 401);
    if (!(await canEditPlans(user))) {
        return json(
            { success: false, error: 'Keine Berechtigung, Dienste zuzuweisen' },
            403);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body' }, 400);
    }
    const eventId = body?.eventId;
    const serviceId = body?.serviceId;
    const personId = body?.personId;
    if (!eventId || !serviceId || !personId) {
        return json(
            { success: false, error: 'eventId, serviceId und personId sind nötig' },
            400);
    }

    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = user?.ct_api_key || env.CHURCHTOOLS_TOKEN;
        if (!base || !token) {
            return json(
                { success: false, error: 'ChurchTools ist nicht konfiguriert' },
                500);
        }
        const client = new ChurchToolsClient(base, token);
        await client.setAssignment(eventId, serviceId, personId);
        return json({ success: true });
    } catch (e: any) {
        console.error('POST /api/assign failed:', e?.message || e);
        return json(
            { success: false, error: e?.message || 'Zuweisung fehlgeschlagen' },
            500);
    }
}
