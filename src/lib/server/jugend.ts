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
/** ChurchTools-Kalender „Jugend Reinigung" (Wochen-Events, Di→Di). */
export const JUGEND_REINIGUNG_CALENDAR_ID = 86;
/** Dienst „Reinigungsdienst Jugend" (serviceGroup 14, Pool = Gruppe 19). */
export const REINIGUNG_SERVICE_ID = 113;
/** ChurchTools-Gruppe „Jugend Wortdienst" (Personen-Pool / Bearbeitungsrecht). */
export const JUGEND_WORTDIENST_GROUP_ID = 228;
/** ChurchTools-Gruppe „Klavierspieler" (Dienst „Klavierspieler", serviceId 10). */
export const KLAVIERSPIELER_GROUP_ID = 136;
/** ChurchTools-Gruppe „Jugend" (für Zuweisungen in Freizeit-Checklisten). */
export const JUGEND_GROUP_ID = 19;
/** Status „Mitglied" (isMember = true). */
const MEMBER_STATUS_ID = 3;
const SEX_MALE = 1;
const SEX_FEMALE = 2;

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

/**
 * Lädt den Jugend-Reinigungsplan (Kalender 86): Wochen-Events (Di→Di), je
 * Event mehrere Slots des Dienstes 113 („Reinigungsdienst Jugend"). Rückgabe:
 * { from, to, events: [{ id, von, bis, title, slots: [{ slotId, person|null,
 *   index }], assignedCount, openCount, total }] }.
 */
export async function loadJugendReinigungsplan(
    user: any,
    fromStr?: string,
    toStr?: string,
) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    const today = new Date();
    const from = fromStr || format(today, 'yyyy-MM-dd');
    const to = toStr || format(addDays(today, 84), 'yyyy-MM-dd');

    const events: any[] = [];
    try {
        const all = await client.getEventsWithServices(from, to);
        for (const ev of all) {
            if (String(ev.calendar?.domainIdentifier) !==
                String(JUGEND_REINIGUNG_CALENDAR_ID)) {
                continue;
            }
            if (!ev.startDate || ev.isCanceled) continue;
            const von = formatInTimeZone(new Date(ev.startDate), TZ, 'yyyy-MM-dd');
            const bis = ev.endDate
                ? formatInTimeZone(new Date(ev.endDate), TZ, 'yyyy-MM-dd')
                : '';

            const slots = (ev.eventServices || [])
                .filter((es: any) => String(es.serviceId) ===
                    String(REINIGUNG_SERVICE_ID))
                .map((es: any) => {
                    const nm = personName(es.person);
                    const filled = !!nm && !isArchived(es.person);
                    return {
                        slotId: String(es.id ?? ''),
                        index: typeof es.index === 'number' ? es.index : 999,
                        person: filled ? personObj(es.person) : null,
                    };
                })
                .sort((a: any, b: any) => a.index - b.index);

            events.push({
                id: String(ev.id ?? ''),
                von,
                bis,
                title: ev.name || ev.caption || 'Reinigung',
                slots,
                assignedCount: slots.filter((s: any) => s.person != null).length,
                openCount: slots.filter((s: any) => s.person == null).length,
                total: slots.length,
            });
        }
    } catch (e) {
        console.error('Jugend-Reinigung: getEventsWithServices failed', e);
    }

    events.sort((a, b) => a.von.localeCompare(b.von));
    return { from, to, serviceId: REINIGUNG_SERVICE_ID, events };
}

/**
 * Mitglieder der CT-Gruppe „Jugend" (19) als [{name, id}] – für Zuweisungen
 * in Freizeit-Checklisten u. ä. (Schnellauswahl).
 */
export async function loadJugendGroupMembers(user: any) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
    const out: { name: string; id: string }[] = [];
    try {
        const r = await client.request(
            `groups/${JUGEND_GROUP_ID}/members?limit=200`);
        for (const m of (r.data || [])) {
            const p = m.person;
            if (isArchived(p)) continue;
            const da = p?.domainAttributes;
            const name = da
                ? `${da.firstName || ''} ${da.lastName || ''}`.trim()
                : (p?.title || '').toString();
            const id = String(m.personId ?? p?.domainIdentifier ?? '');
            if (name && id) out.push({ name, id });
        }
    } catch (e) {
        console.error('Jugend: Gruppenmitglieder laden fehlgeschlagen', e);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { people: out };
}

/** Personen-IDs (als Set) der Mitglieder einer CT-Gruppe. */
export async function loadGroupPersonIds(
    user: any,
    groupId: number,
): Promise<Set<string>> {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
    const ids = new Set<string>();
    try {
        const r = await client.request(`groups/${groupId}/members?limit=300`);
        for (const m of (r.data || [])) {
            const pid = m.personId ?? m.person?.domainIdentifier ?? m.person?.id;
            if (pid != null) ids.add(String(pid));
        }
    } catch (e) {
        console.error(`Jugend: Gruppe ${groupId} laden fehlgeschlagen`, e);
    }
    return ids;
}

/** Geburtsdatum (yyyy-MM-dd) einer einzelnen CT-Person, oder '' . */
export async function loadPersonBirthday(
    user: any,
    personId: string,
): Promise<string> {
    if (!personId) return '';
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
    try {
        const r: any = await client.request(`persons/${personId}`);
        const p = r?.data || r;
        return (p?.birthday || p?.domainAttributes?.birthday || '')
            .toString().slice(0, 10);
    } catch {
        return '';
    }
}

/** Map CT-Personen-ID -> Geburtsdatum (yyyy-MM-dd), für Alters-Statistik. */
export async function loadPersonsBirthdayMap(
    user: any,
): Promise<Map<string, string>> {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);
    const map = new Map<string, string>();
    try {
        for (let page = 1; page <= 15; page++) {
            const r = await client.request(`persons?page=${page}&limit=100`);
            const batch = r.data || [];
            for (const p of batch) {
                const id = String(p.domainIdentifier ?? p.id ?? '');
                const bday = (p.birthday || p.domainAttributes?.birthday || '')
                    .toString();
                if (id && bday) map.set(id, bday.slice(0, 10));
            }
            if (batch.length < 100) break;
        }
    } catch (e) {
        console.error('Jugend: Geburtsdaten laden fehlgeschlagen', e);
    }
    return map;
}

/**
 * Personenliste zum Zuweisen im Jugend-Dienstplan: ALLE männlichen Mitglieder
 * (Status „Mitglied") + weibliche Personen, die als Klavierspieler markiert sind
 * (Mitglied der CT-Gruppe „Klavierspieler", id 136). Rückgabe { people:[{name,id}] }.
 */
export async function loadJugendPeople(user: any) {
    const token = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, token);

    // Klavierspieler-Gruppe: personIds sammeln (für die weibliche Ausnahme).
    const pianistIds = new Set<string>();
    try {
        const r = await client.request(
            `groups/${KLAVIERSPIELER_GROUP_ID}/members?limit=200`);
        for (const m of (r.data || [])) {
            const pid = m.personId ?? m.person?.domainIdentifier ?? m.person?.id;
            if (pid != null) pianistIds.add(String(pid));
        }
    } catch (e) {
        console.error('Jugend: Klavierspieler-Gruppe laden fehlgeschlagen', e);
    }

    // Alle Personen paginiert laden.
    const persons: any[] = [];
    try {
        for (let page = 1; page <= 15; page++) {
            const r = await client.request(`persons?page=${page}&limit=100`);
            const batch = r.data || [];
            persons.push(...batch);
            if (batch.length < 100) break;
        }
    } catch (e) {
        console.error('Jugend: persons laden fehlgeschlagen', e);
    }

    const people: { name: string; id: string; sort: string }[] = [];
    for (const p of persons) {
        if (isArchived(p)) continue;
        const sexId = p.sexId;
        const statusId = p.statusId;
        const id = String(p.domainIdentifier ?? p.id ?? '');
        if (!id) continue;
        const male = sexId === SEX_MALE && statusId === MEMBER_STATUS_ID;
        const femalePianist = sexId === SEX_FEMALE && pianistIds.has(id);
        if (!male && !femalePianist) continue;
        const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        if (!name) continue;
        people.push({ name, id, sort: `${p.lastName || ''} ${p.firstName || ''}` });
    }
    people.sort((a, b) => a.sort.localeCompare(b.sort, 'de'));
    return { people: people.map((p) => ({ name: p.name, id: p.id })) };
}
