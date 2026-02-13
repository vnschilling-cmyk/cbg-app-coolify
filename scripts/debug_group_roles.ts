
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import dotenv from 'dotenv';
dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL!;
const token = process.env.CHURCHTOOLS_TOKEN!;
const groupId = '31';

async function fetchGroupDetails() {
    const client = new ChurchToolsClient(baseUrl, token);
    try {
        console.log(`Fetching details for Group ${groupId}...`);
        const data = await client.request(`groups/${groupId}`);
        console.log('Group Details:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.error('Failed:', e.message);
    }
}

fetchGroupDetails();
