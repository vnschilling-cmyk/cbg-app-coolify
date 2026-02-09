// Test script to explore ChurchTools absences API
import { ChurchToolsClient } from '../src/lib/server/churchtools';

const CHURCHTOOLS_TOKEN = 'FoTBNUxnviZ2HsC7C8nainAjwFPTgQoBjtR2GHUKWzRcH4upiYSjPpQKcBe6qyrJFJ9tCebViNue5ZCL9dbjW8vSowbCkjnPiEVQUKxInwvtZd2gno9nkQ9QNkftc8NqwzWxdwl4WPOCQCRKDKkACtLqupGuZ3gMn7GEREKHaseSSLQreWH0K8X7lfYYywMpCCFhTvhJG0U6VnprtcGWlhFxjLEmojn13OHYLMdIEFQkGHDCVoktCUBO4jkbrn2N';
const CHURCHTOOLS_BASE_URL = 'https://cbggruenberg.church.tools';

async function testAbsences() {
    const client = new ChurchToolsClient(CHURCHTOOLS_BASE_URL, CHURCHTOOLS_TOKEN);

    try {
        const fromDate = '2026-03-01';
        const toDate = '2026-04-30';
        const PREACHER_GROUP_ID = '164';
        const absences = await client.getAbsences(fromDate, toDate, PREACHER_GROUP_ID);
        console.log(`Successfully fetched ${absences.length} absences for group ${PREACHER_GROUP_ID}`);
        if (absences.length > 0) {
            console.log('Sample absence:', JSON.stringify(absences[0], null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testAbsences();
