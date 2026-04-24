import { ChurchToolsClient } from '../src/lib/server/churchtools.ts';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;

async function listCalendars() {
    if (!baseUrl || !token) {
        console.error('Missing config in .env');
        return;
    }

    const client = new ChurchToolsClient(baseUrl, token);
    try {
        console.log('Fetching calendars...');
        // Standard endpoint for calendars
        const response = await client.request('calendars');
        console.log('Available Calendars:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error('Failed to fetch calendars:', e.message);
    }
}

listCalendars();
