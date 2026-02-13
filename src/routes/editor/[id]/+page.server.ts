import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL, PREACHER_GROUP_ID } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';
import { format, addMonths, startOfMonth, endOfMonth, isSaturday } from 'date-fns';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
    try {
        // Get user from locals (populated by hooks if available)
        const user = locals.user || locals.pb?.authStore?.model;
        const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;

        const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

        // Fetch the plan from PocketBase
        let plan: any = null;
        try {
            plan = await locals.pb.collection('plans').getOne(params.id);
        } catch (e) {
            console.error('Plan not found in PB:', e);
            throw error(404, 'Plan nicht gefunden');
        }

        // Define the date range (2 months) from the plan record if available
        const startMonth = plan.period_start ? new Date(plan.period_start) : new Date(2026, 2, 1);
        const fromDate = format(startOfMonth(startMonth), 'yyyy-MM-dd');
        const toDate = format(endOfMonth(addMonths(startMonth, 1)), 'yyyy-MM-dd');

        // Fetch calendars first to get all calendar IDs
        const calendarsResponse = await client.request('calendars');
        const allCalendars = calendarsResponse.data || [];

        // Filter to only relevant calendars for Predigerplan
        // ID 2 = Gottesdienst (Grünberg), ID 65 = Gottesdienst (BN), ID 68 = Bad Neustadt, ID 90 = Sondergemeinschaften
        const relevantCalendarIds = [2, 65, 68, 90];
        const calendars = allCalendars.filter((c: any) => relevantCalendarIds.includes(c.id));
        const calendarIds = calendars.map((c: any) => c.id);

        // Build query string for calendar_ids
        const calendarIdsParam = calendarIds.map((id: number) => `calendar_ids[]=${id}`).join('&');

        // Fetch appointments
        const appointmentsResponse = await client.request(
            `calendars/appointments?from=${fromDate}&to=${toDate}&${calendarIdsParam}`
        );
        const appointments = appointmentsResponse.data || [];

        // Transform appointments into slots format
        const slots = appointments
            .filter((apt: any) => {
                // Filter out invalid dates
                const sDate = new Date(apt.calculated?.startDate || apt.base?.startDate || apt.startDate);
                if (isNaN(sDate.getTime())) return false;

                // FILTER: Ignore Saturday events for Sondergemeinschaften (ID 90)
                const calId = apt.base?.calendar?.id || apt.appointment?.base?.calendar?.id;
                if (calId === 90) {
                    if (isSaturday(sDate)) return false;
                }
                return true;
            })
            .map((apt: any) => {
                // The API returns nested structure: apt.calculated.startDate or apt.base.startDate
                const startDate = new Date(apt.calculated?.startDate || apt.base?.startDate || apt.startDate);
                // ID is under apt.base.id or apt.appointment.base.id
                const appointmentId = apt.base?.id || apt.appointment?.base?.id || apt.id;

                return {
                    id: `${appointmentId}-${format(startDate, 'yyyy-MM-dd')}`,
                    date: format(startDate, 'yyyy-MM-dd'), // Simplified to just date
                    time: format(startDate, 'HH:mm'),
                    label: apt.base?.title || apt.appointment?.base?.title || apt.caption || 'Unbenannter Termin',
                    calendar: apt.base?.calendar?.name || apt.appointment?.base?.calendar?.name || 'Unbekannter Kalender',
                    isSundaySecond: false // Will be calculated client-side
                };
            })
            .sort((a: any, b: any) => a.date.localeCompare(b.date));

        // Fetch group members for preachers from PocketBase to get allowed_services
        let preachers: any[] = [];
        try {
            if (locals.pb) {
                // Find our group record by ct_id
                const pbGroup = await locals.pb.collection('groups').getFirstListItem(`ct_id="${PREACHER_GROUP_ID}"`);

                if (pbGroup) {
                    const pbMembers = await locals.pb.collection('members').getFullList({
                        filter: `group = "${pbGroup.id}"`,
                        sort: 'name'
                    });

                    preachers = pbMembers.map((m: any) => {
                        const [firstName, ...lastNameParts] = m.name.split(' ');
                        return {
                            id: m.id,
                            ct_person_id: m.ct_id || m.id, // Using real ct_id if available
                            firstName: firstName || '',
                            lastName: lastNameParts.join(' ') || '',
                            role: m.role || 'Teilnehmer',
                            comment: '',
                            allowed_services: m.allowed_services || []
                        };
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch group members from PB:', e);
            // Fallback to CT if PB fails or group not yet in PB
            try {
                const membersResponse = await client.request(`groups/${PREACHER_GROUP_ID}/members?limit=100`);
                preachers = (membersResponse.data || []).map((m: any) => ({
                    id: String(m.personId),
                    firstName: m.person?.domainAttributes?.firstName || m.person?.title?.split(' ')[0] || '',
                    lastName: m.person?.domainAttributes?.lastName || m.person?.title?.split(' ').slice(1).join(' ') || '',
                    role: 'Teilnehmer',
                    comment: m.comment || '',
                    allowed_services: []
                }));
            } catch (ctErr) {
                console.error('Fallback CT fetch failed:', ctErr);
            }
        }

        // Fetch absences using group-specific endpoint for efficiency
        let absences: any[] = [];
        try {
            const rawAbsences = await client.getAbsences(fromDate, toDate, PREACHER_GROUP_ID);
            absences = rawAbsences.map((a: any) => ({
                id: String(a.id),
                personId: String(a.personId || a.person?.domainIdentifier || ''),
                fullName: a.person?.title || '',
                startDate: a.startDate,
                endDate: a.endDate,
                reason: a.absenceReason?.nameTranslated || ''
            }));
        } catch (e) {
            console.error('Failed to fetch absences:', e);
        }

        // Fetch events to get existing assignments
        let assignments: Record<string, Record<string, string>> = {};
        try {
            const events = await client.getEventsWithServices(fromDate, toDate);

            for (const event of events) {
                // Fetch event details to get services
                const detailResponse = await client.request(`events/${event.id}`);
                const services = detailResponse.data?.services || [];

                const eventDate = new Date(event.startDate);
                const dateStr = format(eventDate, 'yyyy-MM-dd');
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

        // Merge persisted assignments from PB
        const finalAssignments = { ...assignments, ...(plan.data || {}) };
        const formatting = plan.formatting || null;

        // Fetch service rules for dynamic enforcement
        let serviceRules: any[] = [];
        try {
            if (locals.pb) {
                serviceRules = await locals.pb.collection('service_rules').getFullList({
                    sort: 'weekday,time'
                });
            }
        } catch (e) {
            console.error('Failed to fetch service rules from PB:', e);
        }

        return {
            plan,
            slots,
            preachers,
            calendars,
            absences,
            assignments: finalAssignments,
            formatting,
            serviceRules,
            fromDate,
            toDate
        };

    } catch (error: any) {
        console.error('CRITICAL: Failed to load editor data:', error);
        // Return mostly empty data structure but with error message
        return {
            slots: [],
            preachers: [],
            calendars: [],
            absences: [],
            assignments: {},
            formatting: null,
            fromDate: format(new Date(), 'yyyy-MM-dd'),
            toDate: format(new Date(), 'yyyy-MM-dd'),
            error: `Failed to fetch data: ${error.message || String(error)}`
        };
    }
};


export const actions: Actions = {
    save: async ({ request, params, locals }) => {
        const formData = await request.formData();
        const dataStr = formData.get('data') as string;
        const formattingStr = formData.get('formatting') as string;

        if (!dataStr) {
            return { success: false, error: 'Keine Daten zum Speichern' };
        }

        try {
            const data = JSON.parse(dataStr);
            const updateData: any = { data };

            if (formattingStr) {
                try {
                    updateData.formatting = JSON.parse(formattingStr);
                } catch (e) {
                    console.error('Failed to parse formatting JSON:', e);
                }
            }

            await locals.pb.collection('plans').update(params.id, updateData);
            return { success: true };
        } catch (e: any) {
            console.error('Failed to save plan:', e);
            return { success: false, error: e.message };
        }
    },
    export: async ({ request, params, locals }) => {
        const results: string[] = [];
        try {
            const formData = await request.formData();
            const dataStr = formData.get('data') as string;

            if (!dataStr) {
                return { success: false, error: 'Keine Daten zum Exportieren', results };
            }

            const user = locals.user || locals.pb?.authStore?.model;
            const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;
            const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

            let gridData;
            try {
                gridData = JSON.parse(dataStr);
            } catch (e) {
                return { success: false, error: 'Ungültiges Datenformat', results };
            }

            // Map our internal codes to CT Service IDs
            const getServiceId = (code: string, dateStr: string) => {
                const date = new Date(dateStr);
                const isWednesday = date.getDay() === 3;
                const isSunday = date.getDay() === 0;

                switch (code) {
                    case 'L': return 3;
                    case '1':
                    case '2': return 1;
                    case 'BS': return 91;
                    case 'GS': return 94;
                    case 'Anf': return 88;
                    case 'Schl': return 117;
                    case 'V': return 61;
                    case 'BN': return 1;
                    case 'Als':
                        if (isWednesday) return 91;
                        if (isSunday) return 1;
                        return 1;
                    case '🍷': return 3;
                    default: return null;
                }
            };

            if (!locals.pb) {
                return { success: false, error: 'PocketBase Verbindung nicht verfügbar', results };
            }

            const preachersRaw = await locals.pb.collection('members').getFullList();
            const preacherMap = new Map();
            preachersRaw.forEach((p: any) => {
                if (p.ct_id && p.name) preacherMap.set(p.name.trim(), p.ct_id);
            });

            for (const [slotId, slotAssignments] of Object.entries(gridData)) {
                if (!slotAssignments || typeof slotAssignments !== 'object') continue;

                const parts = (slotId as string).split('-');
                const eventId = parts[0];
                const datePart = parts.slice(1).join('-');

                try {
                    // 1. Fetch current bookings for this event to compare
                    const existingBookings = await client.getEventBookings(eventId);

                    for (const [name, code] of Object.entries(slotAssignments as Record<string, string>)) {
                        if (code === '-' || code === 'X') continue;

                        const personId = preacherMap.get(name.trim());
                        if (!personId) {
                            if (code !== "") results.push(`SKIP: ${name} (Keine CT-ID gefunden)`);
                            continue;
                        }

                        // Check if this person already has a booking in this event
                        const personsBookings = existingBookings.filter(b => String(b.personId) === String(personId));

                        if (code === "") {
                            // User cleared the cell -> DELETE all bookings for this person in this event
                            for (const b of personsBookings) {
                                try {
                                    await client.deleteAssignment(eventId, b.id);
                                    results.push(`OK: ${name} entfernt von Event ${eventId}`);
                                } catch (e: any) {
                                    results.push(`ERROR: ${name} konnte nicht entfernt werden: ${e.message}`);
                                }
                            }
                        } else {
                            const serviceId = getServiceId(code, datePart);
                            if (!serviceId) {
                                results.push(`SKIP: Code ${code} konnte nicht zugeordnet werden`);
                                continue;
                            }

                            // If they already have a booking for the SAME service, maybe skip?
                            const sameService = personsBookings.find(b => String(b.serviceId) === String(serviceId));
                            if (sameService) {
                                // Already correctly assigned (maybe update status to 2 if not confirmed?)
                                if (sameService.statusId !== 2) {
                                    await client.setAssignment(eventId, serviceId, personId, 2);
                                    results.push(`OK: ${name} als ${code} bestätigt`);
                                } else {
                                    results.push(`X: ${name} ist bereits als ${code} eingetragen`);
                                }
                                continue;
                            }

                            // If they have OTHER bookings for DIFFERENT services, delete them first
                            // (Assuming one person, one service per event based on grid logic)
                            for (const b of personsBookings) {
                                await client.deleteAssignment(eventId, b.id);
                            }

                            // Add new assignment
                            try {
                                await client.setAssignment(eventId, serviceId, personId, 2);
                                results.push(`OK: ${name} als ${code} für Event ${eventId}`);
                            } catch (e: any) {
                                results.push(`ERROR: ${name} als ${code}: ${e.message}`);
                            }
                        }
                    }
                } catch (e: any) {
                    results.push(`ERROR: Event ${eventId} konnte nicht verarbeitet werden: ${e.message}`);
                }
            }

            return { success: true, message: 'Export abgeschlossen', results };
        } catch (e: any) {
            console.error('Export critical failure:', e);
            const errorMsg = e instanceof Error ? e.message : String(e);
            return { success: false, error: errorMsg || 'Unbekannter Serverfehler', results };
        }
    }
};
