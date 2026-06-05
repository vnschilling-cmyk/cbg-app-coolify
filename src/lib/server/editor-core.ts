/**
 * Server-Kern für den Prediger-Editor (Laden / Speichern / ChurchTools-Export).
 *
 * Die Logik ist aus `src/routes/editor/[id]/+page.server.ts` extrahiert, damit
 * sowohl die bestehende Svelte-Seite als auch die neue JSON-API (für die
 * Flutter-App) dieselbe, erprobte Implementierung nutzen können.
 */
import PocketBase from 'pocketbase';
import { ChurchToolsClient } from '$lib/server/churchtools';
import {
    CHURCHTOOLS_TOKEN,
    CHURCHTOOLS_BASE_URL,
    PREACHER_GROUP_ID,
} from '$env/static/private';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Lädt alle Daten, die der Editor braucht (Slots, Prediger, Abwesenheiten, Zuweisungen). */
export async function loadEditorData(pb: PocketBase, user: any, planId: string) {
    const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

    const plan: any = await pb.collection('plans').getOne(planId);

    const startMonth = plan.period_start
        ? new Date(plan.period_start)
        : new Date(2026, 2, 1);
    const fromDate = format(startOfMonth(startMonth), 'yyyy-MM-dd');
    const toDate = format(endOfMonth(addMonths(startMonth, 1)), 'yyyy-MM-dd');

    // Kalender holen und auf die relevanten IDs filtern
    const calendarsResponse = await client.request('calendars');
    const allCalendars = calendarsResponse.data || [];
    const relevantCalendarIds = [2, 65, 68, 90];
    const calendars = allCalendars.filter((c: any) =>
        relevantCalendarIds.includes(c.id),
    );
    const calendarIds = calendars.map((c: any) => c.id);
    const calendarIdsParam = calendarIds
        .map((id: number) => `calendar_ids[]=${id}`)
        .join('&');

    // Termine -> Slots
    const appointmentsResponse = await client.request(
        `calendars/appointments?from=${fromDate}&to=${toDate}&${calendarIdsParam}`,
    );
    const appointments = appointmentsResponse.data || [];

    const slots = appointments
        .filter((apt: any) => {
            const sDate = new Date(
                apt.calculated?.startDate || apt.base?.startDate || apt.startDate,
            );
            return !isNaN(sDate.getTime());
        })
        .map((apt: any) => {
            const startDate = new Date(
                apt.calculated?.startDate || apt.base?.startDate || apt.startDate,
            );
            const appointmentId =
                apt.base?.id || apt.appointment?.base?.id || apt.id;
            return {
                id: `${appointmentId}-${formatInTimeZone(startDate, 'Europe/Berlin', 'yyyy-MM-dd')}`,
                date: formatInTimeZone(startDate, 'Europe/Berlin', 'yyyy-MM-dd'),
                time: formatInTimeZone(startDate, 'Europe/Berlin', 'HH:mm'),
                label:
                    apt.base?.title ||
                    apt.appointment?.base?.title ||
                    apt.caption ||
                    'Unbenannter Termin',
                calendar:
                    apt.base?.calendar?.name ||
                    apt.appointment?.base?.calendar?.name ||
                    'Unbekannter Kalender',
                calendarId:
                    apt.base?.calendar?.id ||
                    apt.appointment?.base?.calendar?.id ||
                    null,
                isSundaySecond: false,
            };
        })
        .sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Spalten auf die tatsächlichen Gottesdienste begrenzen:
    //  - Mittwoch (3) und Freitag (5): regulär.
    //  - Sonntag (0): 09:30 (vormittags) + EINE Nachmittagsspalte
    //      (16:00 = Sondergemeinschaft/Gemeindestunde, sonst 17:00 regulär).
    //  - andere Wochentage: nur echte Sondergottesdienste (Kalender 90).
    const wdOf = (d: string) => new Date(`${d}T12:00:00`).getDay();
    const kept = slots.filter((s: any) => {
        const wd = wdOf(s.date);
        const time = (s.time || '').toString();
        // Am Sonntag bekommt ein Alsfeld-Gottesdienst NIE eine eigene Spalte
        // (die Predigt dort wird über den Dienst-Code „Als" zugewiesen).
        const text = `${s.label || ''} ${s.calendar || ''}`.toLowerCase();
        if (wd === 0 && text.includes('alsfeld')) return false;
        if (wd === 0) {
            return time === '09:30' || time === '16:00' || time === '17:00';
        }
        if (wd === 3 || wd === 5) return true;
        // Sondergottesdienst an anderem Tag – aber Samstag (6) ignorieren
        // (interne Sondergemeinschafts-Termine).
        if (wd === 6) return false;
        return s.calendarId === 90;
    });
    // Sonntag-Nachmittag: pro Datum nur EINE Spalte – 16:00 schlägt 17:00.
    const dropIds = new Set<string>();
    const sundaysByDate: Record<string, any[]> = {};
    for (const s of kept) {
        if (wdOf(s.date) === 0) (sundaysByDate[s.date] ||= []).push(s);
    }
    for (const arr of Object.values(sundaysByDate)) {
        if (arr.some((s: any) => (s.time || '') === '16:00')) {
            for (const s of arr) {
                if ((s.time || '') === '17:00') dropIds.add(s.id);
            }
        }
    }
    const visibleSlots = kept.filter((s: any) => !dropIds.has(s.id));

    // Prediger aus PocketBase (mit allowed_services)
    let preachers: any[] = [];
    try {
        const pbGroup = await pb
            .collection('groups')
            .getFirstListItem(`ct_id="${PREACHER_GROUP_ID}"`);
        if (pbGroup) {
            const pbMembers = await pb.collection('members').getFullList({
                filter: `group = "${pbGroup.id}"`,
                sort: 'name',
            });
            preachers = pbMembers.map((m: any) => {
                const [firstName, ...lastNameParts] = m.name.split(' ');
                return {
                    id: m.id,
                    ct_person_id: m.ct_id || m.id,
                    firstName: firstName || '',
                    lastName: lastNameParts.join(' ') || '',
                    role: m.role || 'Teilnehmer',
                    comment: '',
                    allowed_services: m.allowed_services || [],
                    hidden_by_default: m.hidden_by_default || false,
                };
            });
        }
    } catch (e) {
        console.error('Failed to fetch group members from PB:', e);
        try {
            const membersResponse = await client.request(
                `groups/${PREACHER_GROUP_ID}/members?limit=100`,
            );
            preachers = (membersResponse.data || []).map((m: any) => ({
                id: String(m.personId),
                firstName:
                    m.person?.domainAttributes?.firstName ||
                    m.person?.title?.split(' ')[0] ||
                    '',
                lastName:
                    m.person?.domainAttributes?.lastName ||
                    m.person?.title?.split(' ').slice(1).join(' ') ||
                    '',
                role: 'Teilnehmer',
                comment: m.comment || '',
                allowed_services: [],
            }));
        } catch (ctErr) {
            console.error('Fallback CT fetch failed:', ctErr);
        }
    }

    // Doppelte Prediger zusammenführen (gleiche ChurchTools-Person, z. B. nach
    // Umbenennung). Bevorzugt der Datensatz mit konfigurierten Diensten,
    // sonst der mit dem längeren (spezifischeren) Namen.
    // Bevorzugt der Datensatz mit konfigurierten Diensten, sonst längerer Name.
    const ranked = [...preachers].sort((a, b) => {
        const as = a.allowed_services?.length ? 1 : 0;
        const bs = b.allowed_services?.length ? 1 : 0;
        if (as !== bs) return bs - as;
        const al = `${a.firstName} ${a.lastName}`.trim().length;
        const bl = `${b.firstName} ${b.lastName}`.trim().length;
        return bl - al;
    });
    const seenCt = new Set<string>();
    const seenName = new Set<string>();
    const deduped: any[] = [];
    for (const p of ranked) {
        const ct = String(p.ct_person_id || '');
        const nm = `${p.firstName} ${p.lastName}`.trim().toLowerCase();
        if (ct && seenCt.has(ct)) continue; // gleiche CT-Person
        if (nm && seenName.has(nm)) continue; // exakt gleicher Name
        if (ct) seenCt.add(ct);
        if (nm) seenName.add(nm);
        deduped.push(p);
    }
    preachers = deduped;

    // Abwesenheiten
    let absences: any[] = [];
    try {
        const rawAbsences = await client.getAbsences(
            fromDate,
            toDate,
            PREACHER_GROUP_ID,
        );
        absences = rawAbsences.map((a: any) => ({
            id: String(a.id),
            personId: String(a.personId || a.person?.domainIdentifier || ''),
            fullName: a.person?.title || '',
            startDate: a.startDate,
            endDate: a.endDate,
            reason: a.absenceReason?.nameTranslated || '',
        }));
    } catch (e) {
        console.error('Failed to fetch absences:', e);
    }

    // Bestehende Zuweisungen aus ChurchTools
    let assignments: Record<string, Record<string, string>> = {};
    try {
        const events = await client.getEventsWithServices(fromDate, toDate);
        for (const event of events) {
            const services = event.eventServices || [];
            const eventDate = new Date(event.startDate);
            const dateStr = formatInTimeZone(eventDate, 'Europe/Berlin', 'yyyy-MM-dd');
            const slotId = `${event.appointmentId}-${dateStr}`;
            if (!assignments[slotId]) assignments[slotId] = {};
            for (const service of services) {
                const person = service.person;
                if (person && person.domainAttributes) {
                    const name = `${person.domainAttributes.firstName} ${person.domainAttributes.lastName}`;
                    assignments[slotId][name] = 'X';
                }
            }
        }
    } catch (e) {
        console.error('Failed to fetch event assignments:', e);
    }

    // Manuelle-Spalten-Meta aus data herauslösen (nicht als „Slot" mischen).
    const planData: any = { ...(plan.data || {}) };
    const meta = planData.__meta || { hiddenSlots: [], extraSlots: [] };
    delete planData.__meta;

    const finalAssignments = { ...assignments, ...planData };
    const formatting = plan.formatting || null;

    let serviceRules: any[] = [];
    try {
        serviceRules = await pb.collection('service_rules').getFullList({
            sort: 'weekday,time',
        });
    } catch (e) {
        console.error('Failed to fetch service rules from PB:', e);
    }

    if (!plan.hidden_preachers || !Array.isArray(plan.hidden_preachers)) {
        plan.hidden_preachers = preachers
            .filter((p) => p.hidden_by_default)
            .map((p) => String(p.id));
    }

    return {
        plan,
        slots: visibleSlots,
        preachers,
        calendars,
        absences,
        assignments: finalAssignments,
        formatting,
        serviceRules,
        meta,
        fromDate,
        toDate,
    };
}

/** Speichert die Grid-Daten (und optional Formatierung etc.) in den Plan. */
export async function savePlanData(
    pb: PocketBase,
    planId: string,
    body: {
        data: Record<string, unknown>;
        formatting?: unknown;
        specialServices?: unknown;
        hidden_preachers?: unknown;
        hidden_slots?: unknown;
        extra_slots?: unknown;
    },
) {
    // Manuelle Spalten (extra/ausgeblendet) ohne PB-Schemaänderung im
    // JSON-Feld `data` unter dem reservierten Schlüssel __meta ablegen.
    const data: any = { ...(body.data || {}) };
    if (body.hidden_slots !== undefined || body.extra_slots !== undefined) {
        data.__meta = {
            hiddenSlots: body.hidden_slots ?? [],
            extraSlots: body.extra_slots ?? [],
        };
    }
    const updateData: any = { data };
    if (body.formatting !== undefined) updateData.formatting = body.formatting;
    if (body.specialServices !== undefined)
        updateData.special_services = body.specialServices;
    if (body.hidden_preachers !== undefined)
        updateData.hidden_preachers = body.hidden_preachers;

    await pb.collection('plans').update(planId, updateData);
}

/** Exportiert das Grid nach ChurchTools (legt Buchungen an/aktualisiert/löscht). */
export async function exportPlanData(
    pb: PocketBase,
    user: any,
    gridData: Record<string, Record<string, string>>,
): Promise<string[]> {
    const results: string[] = [];

    const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

    const getServiceId = (code: string, dateStr: string): number | null => {
        const date = new Date(dateStr);
        const isWednesday = date.getDay() === 3;
        const isSunday = date.getDay() === 0;
        switch (code) {
            case 'L':
                return 3;
            case '1':
            case '2':
                return 1;
            case 'BS':
                return 91;
            case 'GS':
                return 94;
            case 'Anf':
                return 88;
            case 'Schl':
                return 117;
            case 'V':
                return 61;
            case 'BN':
                return 1;
            case 'Als':
                if (isWednesday) return 91;
                if (isSunday) return 1;
                return 1;
            case '🍷':
                return 3;
            default:
                return null;
        }
    };

    const preachersRaw = await pb.collection('members').getFullList();
    const preacherMap = new Map<string, any>();
    preachersRaw.forEach((p: any) => {
        if (p.ct_id && p.name) preacherMap.set(p.name.trim(), p.ct_id);
    });

    for (const [slotId, slotAssignments] of Object.entries(gridData)) {
        if (!slotAssignments || typeof slotAssignments !== 'object') continue;

        const parts = (slotId as string).split('-');
        const eventId = parts[0];
        const datePart = parts.slice(1).join('-');

        try {
            const existingBookings = await client.getEventBookings(eventId);

            for (const [name, code] of Object.entries(
                slotAssignments as Record<string, string>,
            )) {
                if (code === '-' || code === 'X') continue;

                const personId = preacherMap.get(name.trim());
                if (!personId) {
                    if (code !== '')
                        results.push(`SKIP: ${name} (Keine CT-ID gefunden)`);
                    continue;
                }

                const personsBookings = existingBookings.filter(
                    (b) => String(b.personId) === String(personId),
                );

                if (code === '') {
                    for (const b of personsBookings) {
                        try {
                            await client.deleteAssignment(eventId, b.id);
                            results.push(`OK: ${name} entfernt von Event ${eventId}`);
                        } catch (e: any) {
                            results.push(
                                `ERROR: ${name} konnte nicht entfernt werden: ${e.message}`,
                            );
                        }
                    }
                } else {
                    const serviceId = getServiceId(code, datePart);
                    if (!serviceId) {
                        results.push(`SKIP: Code ${code} konnte nicht zugeordnet werden`);
                        continue;
                    }

                    const sameService = personsBookings.find(
                        (b) => String(b.serviceId) === String(serviceId),
                    );
                    if (sameService) {
                        if (sameService.statusId !== 2) {
                            await client.setAssignment(eventId, serviceId, personId, 2);
                            results.push(`OK: ${name} als ${code} bestätigt`);
                        } else {
                            results.push(`X: ${name} ist bereits als ${code} eingetragen`);
                        }
                        continue;
                    }

                    for (const b of personsBookings) {
                        await client.deleteAssignment(eventId, b.id);
                    }

                    try {
                        await client.setAssignment(eventId, serviceId, personId, 2);
                        results.push(`OK: ${name} als ${code} für Event ${eventId}`);
                    } catch (e: any) {
                        results.push(`ERROR: ${name} als ${code}: ${e.message}`);
                    }
                }
            }
        } catch (e: any) {
            results.push(
                `ERROR: Event ${eventId} konnte nicht verarbeitet werden: ${e.message}`,
            );
        }
    }

    return results;
}
