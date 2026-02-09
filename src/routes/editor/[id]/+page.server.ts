import { ChurchToolsClient } from '$lib/server/churchtools';
import { CHURCHTOOLS_TOKEN, CHURCHTOOLS_BASE_URL, PREACHER_GROUP_ID } from '$env/static/private';
import type { PageServerLoad } from './$types';
import { format, addMonths, startOfMonth, endOfMonth, isSaturday } from 'date-fns';

export const load: PageServerLoad = async ({ params }) => {
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);

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
                    date: startDate.toISOString(),
                    time: format(startDate, 'HH:mm'),
                    label: apt.base?.title || apt.appointment?.base?.title || apt.caption || 'Termin',
                    calendar: apt.base?.calendar?.name || apt.appointment?.base?.calendar?.name || 'Unbekannt',
                    isSundaySecond: false // Will be calculated client-side
                };
            });

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
            console.log(`Fetched ${preachers.length} preachers from CT`);
            if (preachers.length > 0) {
                console.log('Sample Preacher:', preachers[0]);
            }
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

            if (absences.length > 0) {
                console.log(`Transformed ${absences.length} absences. Sample:`, absences[0]);
            }
        } catch (e) {
            console.error('Failed to fetch absences:', e);
        }

        return {
            slots,
            preachers,
            calendars,
            absences, // Pass absences to frontend
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

