import { ChurchToolsClient } from '../src/lib/server/churchtools.ts';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;

async function debugHeaders() {
    if (!baseUrl || !token) {
        console.error('Missing config in .env');
        return;
    }

    const authTypes = ['Login', 'Bearer'];

    for (const authType of authTypes) {
        console.log(`\n--- Testing ${authType} header ---`);
        try {
            const url = `${baseUrl}/api/v2/calendars`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `${authType} ${token}`,
                    'Accept': 'application/json'
                }
            });
            console.log(`Status: ${response.status}`);
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                const data = await response.json();
                console.log(`SUCCESS: Found ${data.data?.length || 0} calendars.`);
            } else {
                const text = await response.text();
                console.log(`FAILED: Received HTML (${text.substring(0, 100)}...)`);
            }
        } catch (e) {
            console.error(`Error with ${authType}: ${e.message}`);
        }
    }
}

debugHeaders();
