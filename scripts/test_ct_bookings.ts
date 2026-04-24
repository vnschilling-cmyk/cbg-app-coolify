import { ChurchToolsClient } from './src/lib/server/churchtools';
import dotenv from 'dotenv';

dotenv.config();

async function testFetch() {
    const client = new ChurchToolsClient(process.env.CHURCHTOOLS_BASE_URL!, process.env.CHURCHTOOLS_TOKEN!);

    // The user's screenshot showed Id: 9176
    const eventId = '9176';

    try {
        console.log(`Fetching bookings for event ${eventId}...`);
        // We'll use a raw request if getBookings doesn't exist, but let's check the client first
        // churchtools.ts has getEvent(id)
        const event = await client.request(`events/${eventId}`);
        console.log('EVENT DATA:', JSON.stringify(event, null, 2));

        const bookings = await client.request(`events/${eventId}/bookings`);
        console.log('BOOKINGS DATA:', JSON.stringify(bookings, null, 2));
    } catch (err: any) {
        console.error('Error:', err.message);
    }
}

testFetch();
