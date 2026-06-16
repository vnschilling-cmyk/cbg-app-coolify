/**
 * POST /api/unassign  { eventId, eventServiceId }
 * Entfernt eine Dienst-Zuweisung (eventService) in ChurchTools. CT legt den
 * freien Slot dieser serviceId danach automatisch wieder an. Nur Planer/Admin.
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
            { success: false, error: 'Keine Berechtigung, Dienste zu ändern' },
            403);
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Ungültiger JSON-Body' }, 400);
    }
    const eventId = body?.eventId;
    const eventServiceId = body?.eventServiceId;
    if (!eventId || !eventServiceId) {
        return json(
            { success: false, error: 'eventId und eventServiceId sind nötig' },
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
        await client.deleteAssignment(eventId, eventServiceId);
        return json({ success: true });
    } catch (e: any) {
        console.error('POST /api/unassign failed:', e?.message || e);
        return json(
            { success: false, error: e?.message || 'Entfernen fehlgeschlagen' },
            500);
    }
}
