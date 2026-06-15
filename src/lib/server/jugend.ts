/**
 * Jugend-Dienstplan: liest die Termine des ChurchTools-Kalenders „Jugend"
 * (id 3) inkl. ihrer Dienste (eventServices) und liefert pro Termin die
 * zugewiesenen Personen je Dienst sowie offene (unbesetzte) Dienste.
 *
 * Personen-Pool/Berechtigung: CT-Gruppe 228 „Jugend Wortdienst".
 * Zuweisen läuft (wie beim Prediger-Plan) über client.setAssignment.
 */
import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL } from '$env/static/private';
import { format, addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Berlin';

/** ChurchTools-Kalender „Jugend". */
export const JUGEND_CALENDAR_ID = 3;
/** ChurchTools-Gruppe „Jugend Wortdienst" (Personen-Pool / Bearbeitungsrecht). */
export const JUGEND_WORTDIENST_GROUP_ID = 228;

function personName(person: any): string {
    if (!person) return '';
    const da = person.domainAttributes;
    if (da && (da.firstName || da.lastName)) {
        return `${da.firstName || ''} ${da.lastName || ''}`.trim();
    }
    return person.title || '';
}

function initialsOf(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const f = parts[0][0] || '';
    const l = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (f + l).toUpperCase();
}

function isArchived(p: any): boolean {
    return p?.isArchived === true || p?.archived === true ||
        p?.domainAttributes?.isArchived === true;
}

function personObj(person: any) {
    const name = personName(person);
    const id = person?.domainIdentifier ?? person?.id ?? null;
    return { name, initials: initialsOf(name), id: id != null ? String(id) : null };
}

/**
 * Lädt die Jugend-Termine (Kalender 3) im Zeitraum inkl. Diensten.
 * Rückgabe: { from, to, events: [{ id, date, time, weekday, title,
 *   services: [{ service, serviceId, person|null }], openCount }] }.
 */
export async function loadJugendPlan(user: any, fromStr?: string, toStr?: string) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    const today = new Date();
    const from = fromStr || format(today, 'yyyy-MM-dd');
    const to = toStr || format(addDays(today, 56), 'yyyy-MM-dd');

    // serviceId -> Name + sortKey (für stabile Spalten-Reihenfolge).
    const svcName = new Map<number, string>();
    const svcSort = new Map<number, number>();
    try {
        for (const s of await client.getServices()) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
            svcSort.set(s.id, typeof s.sortKey === 'number' ? s.sortKey : 999);
        }
    } catch (e) {
        console.error('Jugend: getServices failed', e);
    }

    const events: any[] = [];
    try {
        const all = await client.getEventsWithServices(from, to);
        for (const ev of all) {
            if (String(ev.calendar?.domainIdentifier) !== String(JUGEND_CALENDAR_ID)) {
                continue;
            }
            if (!ev.startDate || ev.isCanceled) continue;
            const d = new Date(ev.startDate);
            const dateStr = formatInTimeZone(d, TZ, 'yyyy-MM-dd');
            const time = formatInTimeZone(d, TZ, 'HH:mm');
            const weekday = Number(formatInTimeZone(d, TZ, 'i')); // 1=Mo … 7=So

            const list = (ev.eventServices || [])
                .map((es: any) => {
                    const nm = personName(es.person);
                    const filled = !!nm && !isArchived(es.person);
                    return {
                        service: svcName.get(es.serviceId) || `Dienst ${es.serviceId}`,
                        serviceId: es.serviceId,
                        sort: svcSort.get(es.serviceId) ?? 999,
                        person: filled ? personObj(es.person) : null,
                    };
                })
                .sort((a: any, b: any) => (a.sort - b.sort) || (a.serviceId - b.serviceId));

            events.push({
                id: String(ev.id ?? ''),
                date: dateStr,
                time,
                weekday,
                title: ev.name || ev.caption || 'Jugend',
                services: list.map((s: any) => ({
                    service: s.service,
                    serviceId: s.serviceId,
                    person: s.person,
                })),
                openCount: list.filter((s: any) => s.person == null).length,
            });
        }
    } catch (e) {
        console.error('Jugend: getEventsWithServices failed', e);
    }

    events.sort((a, b) =>
        `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    return { from, to, events };
}
