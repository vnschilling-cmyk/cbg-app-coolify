
import { ChurchToolsClient } from '../src/lib/server/churchtools.js'; // Use .js for tsx/node compatibility if needed
import pkg from 'dotenv';
const { config } = pkg;
config();

const CHURCHTOOLS_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const CHURCHTOOLS_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const PREACHER_GROUP_ID = process.env.PREACHER_GROUP_ID;

async function main() {
    if (!CHURCHTOOLS_TOKEN || !CHURCHTOOLS_BASE_URL) {
        console.error("Missing credentials");
        return;
    }

    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);

    // Exact dates from +page.server.ts for March 2026
    const fromDate = '2026-03-01';
    const toDate = '2026-04-30';

    console.log(`Fetching calendars...`);
    const calendarsResponse = await client.request('calendars');
    const allCalendars = calendarsResponse.data || [];

    const relevantCalendarIds = [2, 65, 68, 90];
    const calendars = allCalendars.filter((c: any) => relevantCalendarIds.includes(c.id));
    const calendarIds = calendars.map((c: any) => c.id);
    const calendarIdsParam = calendarIds.map((id) => `calendar_ids[]=${id}`).join('&');

    console.log(`Relevant Calendar IDs: ${calendarIds}`);

    console.log(`Fetching appointments from ${fromDate} to ${toDate}...`);
    const appointmentsResponse = await client.request(
        `calendars/appointments?from=${fromDate}&to=${toDate}&${calendarIdsParam}`
    );
    const appointments = appointmentsResponse.data || [];
    console.log(`Found ${appointments.length} appointments.`);

    const marchFirstToTwelfth = appointments.filter((apt: any) => {
        const date = apt.calculated?.startDate || apt.base?.startDate || apt.startDate;
        return date.startsWith('2026-03-0'); // Covers 01 to 09
    }).concat(appointments.filter((apt: any) => {
        const date = apt.calculated?.startDate || apt.base?.startDate || apt.startDate;
        return date.startsWith('2026-03-10') || date.startsWith('2026-03-11') || date.startsWith('2026-03-12');
    }));

    console.log(`Appointments between March 1st and 12th: ${marchFirstToTwelfth.length}`);
    marchFirstToTwelfth.forEach((apt: any) => {
        const date = apt.calculated?.startDate || apt.base?.startDate || apt.startDate;
        const title = apt.base?.title || apt.appointment?.base?.title || apt.caption;
        console.log(`- [${date}] ${title}`);
    });
}

main().catch(console.error);
