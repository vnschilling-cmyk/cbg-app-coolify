
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import pkg from 'dotenv';
const { config } = pkg;
config();

const CHURCHTOOLS_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const CHURCHTOOLS_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;

async function main() {
    if (!CHURCHTOOLS_TOKEN || !CHURCHTOOLS_BASE_URL) {
        console.error("Missing credentials");
        return;
    }

    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);

    console.log("Fetching all calendars...");
    const cals = await client.request('calendars');
    console.log(`Found ${cals.data.length} calendars.`);

    const fromDate = '2026-03-01';
    const toDate = '2026-03-15';

    console.log(`Fetching all appointments from ${fromDate} to ${toDate}...`);
    const appointments = await client.request(`calendars/appointments?from=${fromDate}&to=${toDate}`);

    console.log(`Found ${appointments.data.length} appointments in this period.`);

    appointments.data.forEach((apt: any) => {
        const date = apt.calculated?.startDate || apt.base?.startDate || apt.startDate;
        const title = apt.base?.title || apt.appointment?.base?.title || apt.caption;
        const calId = apt.base?.calendar?.id || apt.appointment?.base?.calendar?.id;
        const calName = apt.base?.calendar?.name || apt.appointment?.base?.calendar?.name;

        console.log(`- [${date}] [Cal ${calId}: ${calName}] ${title}`);
    });
}

main().catch(console.error);
