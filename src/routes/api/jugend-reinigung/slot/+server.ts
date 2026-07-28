/**
 * POST /api/jugend-reinigung/slot  { eventId, action: 'add' | 'trim' }
 * Ändert die Slot-Anzahl des Reinigungsdienstes (113) an einem Wochen-Event,
 * um mehr als die Vorlage (BASE_SLOTS) Personen einteilen zu können.
 *   'add'  -> +1 (neuer leerer Platz für die 6.+ Person)
 *   'trim' -> -1, aber NUR wenn > BASE_SLOTS und mindestens ein freier Slot
 *             existiert (nie einen besetzten Slot entfernen).
 * Nur Dienstplaner/Admin oder Jugendleitung.
 */
import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { canEditPlans, isJugendLeitung } from '$lib/server/admin';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { REINIGUNG_SERVICE_ID } from '$lib/server/jugend';
import { env } from '$env/dynamic/private';

export const OPTIONS: RequestHandler = async () => preflight();

/** Basis-Slots der Event-Vorlage; Extra-Plätze (darüber) werden wieder abgebaut. */
const BASE_SLOTS = 5;

export const POST: RequestHandler = async ({ request }) => {
    const { user } = await pbFromRequest(request);
    if (!user) return json({ error: 'Nicht autorisiert' }, 401);
    if (!((await canEditPlans(user)) || (await isJugendLeitung(user)))) {
        return json({ error: 'Keine Berechtigung' }, 403);
    }
    let body: any;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Ungültiger JSON-Body' }, 400);
    }
    const eventId = (body?.eventId ?? '').toString();
    const action = (body?.action ?? '').toString();
    if (!eventId || (action !== 'add' && action !== 'trim')) {
        return json({ error: 'eventId und action (add|trim) nötig' }, 400);
    }

    try {
        const base = env.CHURCHTOOLS_BASE_URL;
        const token = user?.ct_api_key || env.CHURCHTOOLS_TOKEN;
        if (!base || !token) {
            return json({ error: 'ChurchTools ist nicht konfiguriert' }, 500);
        }
        const client = new ChurchToolsClient(base, token);
        const services = await client.getEventServices(eventId);
        const own = services.filter(
            (s: any) => String(s.serviceId) === String(REINIGUNG_SERVICE_ID));
        const cur = own.length;
        const open = own.filter((s: any) => s.personId == null).length;

        if (action === 'add') {
            await client.setServiceSlotCount(eventId, REINIGUNG_SERVICE_ID, cur + 1);
            return json({ count: cur + 1, changed: true });
        }
        // trim: nur Extra-Slots (über BASE) und nur einen FREIEN entfernen.
        if (cur <= BASE_SLOTS || open < 1) {
            return json({ count: cur, changed: false });
        }
        await client.setServiceSlotCount(eventId, REINIGUNG_SERVICE_ID, cur - 1);
        return json({ count: cur - 1, changed: true });
    } catch (e: any) {
        console.error('POST /api/jugend-reinigung/slot failed:', e?.message || e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
