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
import { format, addMonths, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const TZ = 'Europe/Berlin';

/** Plan-Code (Zelle) → ChurchTools-serviceId. Datum entscheidet bei „Als". */
function serviceIdForCode(code: string, dateStr: string): number | null {
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
}

/**
 * ChurchTools-serviceIds, die der Prediger-Plan verwaltet (Wertebereich von
 * serviceIdForCode). NUR diese dürfen je gelöscht/abgeglichen werden – fremde
 * Dienste (z. B. Reinigung, Musik) bleiben unberührt.
 */
const MANAGED_SERVICE_IDS = new Set<number>([1, 3, 61, 88, 91, 94, 117]);

/** Baut die Map `appointmentId-datum → CT-Event (inkl. eventServices)`. */
async function buildEventByApptDate(
    client: ChurchToolsClient,
    gridData: Record<string, Record<string, string>>,
    results?: string[],
): Promise<Map<string, any>> {
    const slotDates = Object.keys(gridData)
        .map((k) => k.split('-').slice(1).join('-'))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
    const map = new Map<string, any>();
    if (!slotDates.length) return map;
    const from = slotDates[0];
    // `to` ist in der CT-Events-API exklusiv → einen Tag zugeben.
    const to = format(addDays(new Date(slotDates[slotDates.length - 1]), 1), 'yyyy-MM-dd');
    try {
        const events = await client.getEventsWithServices(from, to);
        for (const ev of events) {
            if (!ev.startDate || ev.appointmentId == null) continue;
            const d = formatInTimeZone(new Date(ev.startDate), TZ, 'yyyy-MM-dd');
            map.set(`${ev.appointmentId}-${d}`, ev);
        }
    } catch (e: any) {
        results?.push(`ERROR: CT-Events konnten nicht geladen werden: ${e.message}`);
    }
    return map;
}

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

    // Ausgeblendete Prediger: zuerst aus __meta (zuverlässig persistiert),
    // dann altes Top-Level-Feld, sonst Default (hidden_by_default).
    if (Array.isArray(meta.hiddenPreachers)) {
        plan.hidden_preachers = meta.hiddenPreachers.map((x: any) => String(x));
    } else if (!plan.hidden_preachers || !Array.isArray(plan.hidden_preachers)) {
        plan.hidden_preachers = preachers
            .filter((p) => p.hidden_by_default)
            .map((p) => String(p.id));
    }

    // Sondergemeinschaften (Kalender 90) als separate Liste fuer den Plan:
    // echte interne Gemeinschaftstermine OHNE Gottesdienste/Gemeindestunden,
    // ohne Hochzeiten und ohne Termine, die bereits eine eigene Spalte haben.
    const columnIds = new Set(visibleSlots.map((s: any) => s.id));
    const specialFellowships = slots
        .filter((s: any) => s.calendarId === 90 && !columnIds.has(s.id))
        .filter((s: any) => {
            const t = `${s.label || ''}`.toLowerCase();
            return !t.includes('hochzeit') && !t.includes('gemeindestunde');
        })
        .map((s: any) => ({ date: s.date, time: s.time, title: s.label }))
        .sort((a: any, b: any) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

    return {
        plan,
        slots: visibleSlots,
        preachers,
        calendars,
        absences,
        assignments: finalAssignments,
        formatting,
        serviceRules,
        specialFellowships,
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
    // Manuelle Spalten UND ausgeblendete Prediger im JSON-Feld `data.__meta`
    // ablegen – das persistiert zuverlässig, ohne PB-Schemafeld.
    if (body.hidden_slots !== undefined ||
        body.extra_slots !== undefined ||
        body.hidden_preachers !== undefined) {
        data.__meta = {
            hiddenSlots: body.hidden_slots ?? [],
            extraSlots: body.extra_slots ?? [],
            hiddenPreachers: body.hidden_preachers ?? [],
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

    const preachersRaw = await pb.collection('members').getFullList();
    const preacherMap = new Map<string, any>();
    preachersRaw.forEach((p: any) => {
        if (p.ct_id && p.name) preacherMap.set(p.name.trim(), p.ct_id);
    });

    // Grid-Slots sind nach `appointmentId` (Kalender-Termin) + Datum gekeyt
    // (siehe loadEditorData). Die eventServices-API braucht aber die echte
    // `event.id`. Mapping über den Datumsbereich des Grids auflösen, statt
    // die appointmentId fälschlich als Event-ID zu verwenden (sonst 404).
    const eventByApptDate = await buildEventByApptDate(client, gridData, results);

    for (const [slotId, slotAssignments] of Object.entries(gridData)) {
        if (!slotAssignments || typeof slotAssignments !== 'object') continue;

        const datePart = (slotId as string).split('-').slice(1).join('-');

        // appointmentId+Datum → echtes CT-Event auflösen.
        const slotEvent = eventByApptDate.get(slotId);
        if (!slotEvent) {
            const hasWork = Object.values(
                slotAssignments as Record<string, string>,
            ).some((c) => c !== '' && c !== '-' && c !== 'X');
            if (hasWork) results.push(`SKIP: Kein CT-Event für Termin ${slotId}`);
            continue;
        }
        const eventId = slotEvent.id;

        try {
            const existingBookings = await client.getEventServices(eventId);

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

                // SICHERHEIT (2026-06-07): Der Export löscht vorerst NICHTS
                // mehr — er ist rein ADDITIV. Die frühere Lösch-Logik hat
                // bestehende CT-Zuweisungen entfernt, sobald eine Zelle leer
                // war oder die Person anderswo eingetragen war (auch in Diensten
                // außerhalb des Prediger-Plans, z.B. Reinigung). Bis die
                // Reichweite sauber begrenzt ist, werden ausschließlich gefüllte
                // Zellen als bestätigte Zuweisung geschrieben.
                if (code === '') continue; // leere Zelle: NICHT mehr löschen

                const serviceId = serviceIdForCode(code, datePart);
                if (!serviceId) {
                    results.push(`SKIP: Code ${code} konnte nicht zugeordnet werden`);
                    continue;
                }

                const sameService = personsBookings.find(
                    (b) => String(b.serviceId) === String(serviceId),
                );
                if (sameService && sameService.isAccepted) {
                    results.push(`X: ${name} ist bereits als ${code} eingetragen`);
                    continue;
                }

                try {
                    await client.setAssignment(eventId, serviceId, personId);
                    results.push(`OK: ${name} als ${code} für Event ${eventId}`);
                } catch (e: any) {
                    results.push(`ERROR: ${name} als ${code}: ${e.message}`);
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

export interface DeletionCandidate {
    eventId: number | string;
    eventServiceId: number | string;
    serviceId: number;
    serviceName: string;
    date: string; // yyyy-MM-dd
    personId: string;
    personName: string;
}

/**
 * Ermittelt „verwaiste" ChurchTools-Zuweisungen: Plan-Prediger, die in einem
 * vom Plan verwalteten Dienst (MANAGED_SERVICE_IDS) eingetragen sind, aber im
 * aktuellen Grid NICHT (mehr) diese Zuweisung haben. Es wird NICHTS gelöscht –
 * nur Kandidaten für die Bestätigung zurückgegeben (Dienst · Datum · Person).
 */
export async function computeExportDeletions(
    pb: PocketBase,
    user: any,
    gridData: Record<string, Record<string, string>>,
): Promise<DeletionCandidate[]> {
    const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

    const preachersRaw = await pb.collection('members').getFullList();
    const ctIdByName = new Map<string, string>(); // Name → ct_id
    const nameByCtId = new Map<string, string>(); // ct_id → Name
    const preacherCtIds = new Set<string>();
    preachersRaw.forEach((p: any) => {
        if (p.ct_id && p.name) {
            ctIdByName.set(p.name.trim(), String(p.ct_id));
            nameByCtId.set(String(p.ct_id), p.name.trim());
            preacherCtIds.add(String(p.ct_id));
        }
    });

    const svcName = new Map<number, string>();
    try {
        for (const s of await client.getServices()) {
            svcName.set(s.id, s.name || s.nameTranslated || '');
        }
    } catch {
        /* Namen optional – Fallback unten */
    }

    const eventByApptDate = await buildEventByApptDate(client, gridData);

    const out: DeletionCandidate[] = [];
    for (const [slotId, slotAssignments] of Object.entries(gridData)) {
        if (!slotAssignments || typeof slotAssignments !== 'object') continue;
        const ev = eventByApptDate.get(slotId);
        if (!ev) continue;
        const eventId = ev.id;
        const datePart = slotId.split('-').slice(1).join('-');

        // Was das Grid je Person (ct_id) WILL: Menge der gewünschten serviceIds.
        const desiredByCtId = new Map<string, Set<number>>();
        for (const [name, code] of Object.entries(
            slotAssignments as Record<string, string>,
        )) {
            if (code === '' || code === '-' || code === 'X') continue;
            const ctId = ctIdByName.get(name.trim());
            if (!ctId) continue;
            const sid = serviceIdForCode(code, datePart);
            if (sid == null) continue;
            if (!desiredByCtId.has(ctId)) desiredByCtId.set(ctId, new Set());
            desiredByCtId.get(ctId)!.add(sid);
        }

        let existing: any[] = ev.eventServices || [];
        if (!existing.length) {
            try {
                existing = await client.getEventServices(eventId);
            } catch {
                existing = [];
            }
        }
        for (const b of existing) {
            if (b.personId == null) continue;
            const sid = Number(b.serviceId);
            if (!MANAGED_SERVICE_IDS.has(sid)) continue; // nur Plan-Dienste
            const ctId = String(b.personId);
            if (!preacherCtIds.has(ctId)) continue; // nur Plan-Prediger
            const wanted = desiredByCtId.get(ctId);
            if (wanted && wanted.has(sid)) continue; // Grid will das weiterhin
            out.push({
                eventId,
                eventServiceId: b.id,
                serviceId: sid,
                serviceName: svcName.get(sid) || `Dienst ${sid}`,
                date: formatInTimeZone(new Date(ev.startDate), TZ, 'yyyy-MM-dd'),
                personId: ctId,
                personName: b.person?.title || b.name || nameByCtId.get(ctId) || `Person ${ctId}`,
            });
        }
    }
    return out;
}

/**
 * Löscht NUR die übergebenen Zuweisungen – und auch nur, wenn sie weiterhin
 * gültige Kandidaten sind (erneut serverseitig gegen das Grid geprüft, damit
 * niemals etwas außerhalb der verwalteten Dienste/Prediger gelöscht wird).
 */
export async function applyExportDeletions(
    pb: PocketBase,
    user: any,
    gridData: Record<string, Record<string, string>>,
    requested: Array<{ eventId: number | string; eventServiceId: number | string }>,
): Promise<string[]> {
    const results: string[] = [];
    const candidates = await computeExportDeletions(pb, user, gridData);
    const allowed = new Set(
        candidates.map((c) => `${c.eventId}:${c.eventServiceId}`),
    );

    const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

    for (const it of requested) {
        const key = `${it.eventId}:${it.eventServiceId}`;
        if (!allowed.has(key)) {
            results.push(`SKIP: ${key} ist kein gültiger Lösch-Kandidat (übersprungen)`);
            continue;
        }
        try {
            await client.deleteAssignment(it.eventId, it.eventServiceId);
            results.push(`OK: Zuweisung ${it.eventServiceId} entfernt`);
        } catch (e: any) {
            results.push(`ERROR: ${it.eventServiceId} konnte nicht entfernt werden: ${e.message}`);
        }
    }
    return results;
}
