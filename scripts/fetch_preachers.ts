import { ChurchToolsClient } from '../src/lib/server/churchtools.ts';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;
const groupId = process.env.PREACHER_GROUP_ID;

async function fetchPreachers() {
    if (!baseUrl || !token || !groupId) {
        console.error('Missing config in .env');
        return;
    }

    const testEndpoints = [
        `groups/${groupId}/members`,
        `v2/groups/${groupId}/members`,
        `../index.php?q=ct/api/groups/${groupId}/members`
    ];

    for (const endpoint of testEndpoints) {
        const client = new ChurchToolsClient(baseUrl, token);
        try {
            console.log(`Trying endpoint: ${endpoint}...`);
            const members = await client.getGroupMembers(endpoint);

            const preachers = members.map((m: any) => ({
                firstName: m.person?.firstName || m.firstName,
                lastName: m.person?.lastName || m.lastName
            }));

            preachers.sort((a: any, b: any) => a.lastName.localeCompare(b.lastName));

            console.log('SUCCESS! Preacher List:');
            console.log(JSON.stringify(preachers, null, 2));
            return; // Exit on success
        } catch (e) {
            console.log(`Failed endpoint ${endpoint}: ${e.message}`);
        }
    }
}

fetchPreachers();
