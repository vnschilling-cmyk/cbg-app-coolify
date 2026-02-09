import { ChurchToolsClient } from '../src/lib/server/churchtools';

const CHURCHTOOLS_TOKEN = 'FoTBNUxnviZ2HsC7C8nainAjwFPTgQoBjtR2GHUKWzRcH4upiYSjPpQKcBe6qyrJFJ9tCebViNue5ZCL9dbjW8vSowbCkjnPiEVQUKxInwvtZd2gno9nkQ9QNkftc8NqwzWxdwl4WPOCQCRKDKkACtLqupGuZ3gMn7GEREKHaseSSLQreWH0K8X7lfYYywMpCCFhTvhJG0U6VnprtcGWlhFxjLEmojn13OHYLMdIEFQkGHDCVoktCUBO4jkbrn2N';
const CHURCHTOOLS_BASE_URL = 'https://cbggruenberg.church.tools';

async function findEndpoint() {
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);

    const endpoints = [
        'absencetypes',
        'person/absences',
        'v2/person/absences',
        'groups/164/absences'
    ];

    for (const ep of endpoints) {
        try {
            console.log(`\n--- Testing: ${ep} ---`);
            const res = await client.request(ep);
            console.log(`SUCCESS [${ep}]:`, JSON.stringify(res, null, 2).substring(0, 200));
        } catch (e) {
            console.log(`FAILED [${ep}]: ${e.message}`);
        }
    }
}

findEndpoint();
