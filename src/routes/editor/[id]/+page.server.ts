import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL, PREACHER_GROUP_ID } from '$env/static/private';
import type { PageServerLoad } from './$types';
import { format, addMonths, startOfMonth, endOfMonth, isSaturday } from 'date-fns';

export const load: PageServerLoad = async ({ params, locals }) => {
    // Get user from locals (populated by hooks if available)
    const user = locals.user || locals.pb?.authStore?.model;
    const userToken = user?.ct_api_key || CHURCHTOOLS_TOKEN;

    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, userToken);

    // Define the date range (2 months)
    const startMonth = new Date(2026, 2, 1); // March 2026
    const fromDate = format(startOfMonth(startMonth), 'yyyy-MM-dd');
    const toDate = format(endOfMonth(addMonths(startMonth, 1)), 'yyyy-MM-dd');

    try {
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
                // FILTER: Ignore Saturday events for Sondergemeinschaften (ID 90)
                const calId = apt.base?.calendar?.id || apt.appointment?.base?.calendar?.id;
                if (calId === 90) {
                    const startDate = new Date(apt.calculated?.startDate || apt.base?.startDate || apt.startDate);
                    if (isSaturday(startDate)) return false;
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
                    date: format(startDate, "yyyy-MM-dd'T'HH:mm:ss"), // No 'Z' to avoid UTC shift in browser
                    time: format(startDate, 'HH:mm'),
                    label: apt.base?.title || apt.appointment?.base?.title || apt.caption || 'Unbenannter Termin',
                    calendar: apt.base?.calendar?.name || apt.appointment?.base?.calendar?.name || 'Unbekannter Kalender',
                    isSundaySecond: false // Will be calculated client-side
                };
            })
            .sort((a: any, b: any) => a.date.localeCompare(b.date));

        // Fetch group members for preachers (with limit=100 to get all)
        let preachers: any[] = [];
        try {
            const membersResponse = await client.request(`groups/${PREACHER_GROUP_ID}/members?limit=100`);

            // Map role IDs to role names
            const roleMap: Record<number, string> = {
                9: 'Leiter',
                8: 'Teilnehmer',
                42: 'Teilnehmer 2'
            };

            preachers = (membersResponse.data || []).map((m: any) => ({
                id: m.personId,
                firstName: m.person?.domainAttributes?.firstName || m.person?.title?.split(' ')[0] || '',
                lastName: m.person?.domainAttributes?.lastName || m.person?.title?.split(' ').slice(1).join(' ') || '',
                role: roleMap[m.groupTypeRoleId] || 'Teilnehmer',
                comment: m.comment || ''
            }));
        } catch (e) {
            console.error('Failed to fetch group members:', e);
        }

        // Fetch absences using group-specific endpoint for efficiency
        let absences: any[] = [];
        try {
            const rawAbsences = await client.getAbsences(fromDate, toDate, PREACHER_GROUP_ID);
            absences = rawAbsences.map((a: any) => ({
                id: String(a.id),
                personId: String(a.personId || a.person?.domainIdentifier || ''),
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
                // If the event has services, fetch details to get persons
                // Note: The basic events list might already have some services depending on the API version,
                // but usually we need a second call per event or an include parameter.
                // For performance, let's see if we can get them from the event detail if we have few events.
                // Assuming we want to show existing data for the preacher plan.

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
                        // Map ChurchTools service role to our grid codes if possible
                        // For now, let's just mark who is assigned.
                        // We'll need to match names with our preacher list.
                        assignments[slotId][name] = 'X'; // Placeholder, will be refined if we find code mapping
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch event assignments:', e);
        }

        return {
            slots,
            preachers,
            calendars,
            absences,
            assignments, // New field for pre-filled data
            fromDate,
            toDate
        };
    } catch (error) {
        console.error('Failed to fetch ChurchTools data:', error);
        return {
            slots: [],
            preachers: [],
            calendars: [],
            absences: [],
            fromDate,
            toDate,
            error: 'Failed to fetch data from ChurchTools'
        };
    }
};

