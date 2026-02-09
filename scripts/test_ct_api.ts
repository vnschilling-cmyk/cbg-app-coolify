import { ChurchToolsClient } from '../src/lib/server/churchtools.ts';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;

async function testEndpoints() {
    if (!token) {
        console.error('Missing token in .env');
        return;
    }

    const baseUrls = [
        'https://cbggruenberg.church.tools'
    ];

    const endpoints = [
        'v2/calendars',
        'calendars',
        'v2/groups'
    ];

    for (const base of baseUrls) {
        console.log(`\n\n=== TESTING BASE URL: ${base} ===`);
        const client = new ChurchToolsClient(base, token);
        for (const endpoint of endpoints) {
            try {
                console.log(`\n--- Testing endpoint: ${endpoint} ---`);
                const response = await (client as any).request(endpoint);
                console.log(`SUCCESS [${endpoint}]:`);
                console.log(JSON.stringify(response.data || response, null, 2).substring(0, 500));
            } catch (e) {
                console.log(`FAILED [${endpoint}]: ${e.message}`);
            }
        }
    }
}

testEndpoints();
