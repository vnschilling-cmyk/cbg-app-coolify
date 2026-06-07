import type { RequestHandler } from './$types';
import { json, preflight, pbFromRequest } from '$lib/server/api';
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';

export const OPTIONS: RequestHandler = async () => preflight();

/** Termin (appointment) auf eine schlanke Form bringen – robust gegen die
 * unterschiedlichen ChurchTools-Antwortformen (base/calculated bzw. flach). */
function normalize(it: any) {
    const a = it?.appointment ?? it ?? {};
    const base = a.base ?? a;
    const calc = a.calculated ?? {};
    const start = String(calc.startDate ?? base.startDate ?? base.start ?? '');
    if (!start) return null;
    const calId = base.calendar?.id ?? base.calendarId ?? a.calendarId ?? null;
    return {
        title: base.caption ?? base.title ?? base.subject ?? '',
        calendarId: calId != null ? String(calId) : null,
        date: start.slice(0, 10),
        allDay: base.allDay === true,
    };
}

/** GET /api/ct-appointments?ids=1,2&from=&to= -> Termine der Kalender. */
export const GET: RequestHandler = async ({ request, url }) => {
    const { user, pb } = await pbFromRequest(request);
    if (!pb.authStore.isValid) {
        return json({ error: 'Nicht autorisiert' }, 401);
    }
    try {
        const ids = (url.searchParams.get('ids') || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) return json({ appointments: [] });

        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const iso = (d: Date) =>
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const from = url.searchParams.get('from') ||
            iso(new Date(today.getFullYear(), today.getMonth(), 1));
        const to = url.searchParams.get('to') ||
            iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));

        const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
        const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
        const raw = await client.getAppointments(ids, from, to);
        const appointments = raw.map(normalize).filter(Boolean);
        return json({ appointments });
    } catch (e: any) {
        console.error('API ct-appointments failed:', e);
        return json({ error: e?.message || 'Fehler' }, 500);
    }
};
