import { ChurchToolsClient } from '../src/lib/server/churchtools';
import * as dotenv from 'dotenv';
dotenv.config();

const CHURCHTOOLS_BASE_URL = process.env.CHURCHTOOLS_BASE_URL || '';
const CHURCHTOOLS_TOKEN = process.env.CHURCHTOOLS_TOKEN || '';

async function debug() {
    try {
        console.log('Fetching all services...');
        const resp = await fetch(`${CHURCHTOOLS_BASE_URL}/api/services?limit=100`, {
            headers: { 'Authorization': `Login ${CHURCHTOOLS_TOKEN}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            console.log(`Found ${data.data.length} services.`);
            data.data.forEach((s: any) => {
                console.log(`ID: ${s.id}, Name: "${s.name}", Key: "${s.key}"`);
            });
        } else {
            console.log('Failed:', await resp.text());
        }
    } catch (err: any) {
        console.error('Error:', err.message);
    }
}

debug();
