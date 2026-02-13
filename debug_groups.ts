
import { ChurchToolsClient } from './src/lib/server/churchtools';
import dotenv from 'dotenv';

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function listGroups() {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing CT config');
        return;
    }
    const client = new ChurchToolsClient(CT_BASE_URL, CT_TOKEN);
    try {
        const response = await client.request('groups');
        const groups = response.data || [];
        console.log('--- CHURCHTOOLS GROUPS ---');
        groups.forEach((g: any) => {
            console.log(`ID: ${g.id} | Name: ${g.name} | Type: ${g.groupTypeId}`);
        });
    } catch (e) {
        console.error('Failed to fetch groups:', e);
    }
}

listGroups();
