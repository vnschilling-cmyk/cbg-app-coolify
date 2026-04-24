import { ChurchToolsClient } from '../src/lib/server/churchtools.ts';
import dotenv from 'dotenv';

dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;

async function testAuth() {
    if (!baseUrl || !token) return;

    // Try v2 whoami
    const client = new ChurchToolsClient(baseUrl, token);
    try {
        console.log('Testing whoami...');
        const data = await client.request('whoami');
        console.log('WHOAMI response:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.error('WHOAMI failed:', e.message);
        if (e.cause) {
            console.error('Cause:', e.cause);
        }
    }
}

testAuth();
