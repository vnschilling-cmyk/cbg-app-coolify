import { ChurchToolsClient } from '../src/lib/server/churchtools';

const CHURCHTOOLS_TOKEN = 'FoTBNUxnviZ2HsC7C8nainAjwFPTgQoBjtR2GHUKWzRcH4upiYSjPpQKcBe6qyrJFJ9tCebViNue5ZCL9dbjW8vSowbCkjnPiEVQUKxInwvtZd2gno9nkQ9QNkftc8NqwzWxdwl4WPOCQCRKDKkACtLqupGuZ3gMn7GEREKHaseSSLQreWH0K8X7lfYYywMpCCFhTvhJG0U6VnprtcGWlhFxjLEmojn13OHYLMdIEFQkGHDCVoktCUBO4jkbrn2N';
const CHURCHTOOLS_BASE_URL = 'https://cbggruenberg.church.tools';

async function findEndpoint() {
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);
    const from = '2026-03-01';
    const to = '2026-04-30';

    const patterns = [
        'absences',
        'v2/absences',
        'persons/absences',
        'v3/absences',
        'calendar/absences',
        'resources/absences'
    ];

    for (const pattern of patterns) {
        try {
            console.log(`\n--- Testing: ${pattern} ---`);
            const res = await client.request(`${pattern}?from=${from}&to=${to}`);
            console.log(`SUCCESS [${pattern}]: Found ${res.data?.length || 0} items`);
            if (res.data?.length > 0) {
                console.log('Sample:', JSON.stringify(res.data[0], null, 2));
                return; // Found it!
            }
        } catch (e) {
            console.log(`FAILED [${pattern}]: ${e.message}`);
        }
    }
}

findEndpoint();
