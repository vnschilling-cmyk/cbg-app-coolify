
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import dotenv from 'dotenv';

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function discoverServices() {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing ChurchTools config in .env');
        return;
    }

    console.log(`Connecting to ChurchTools at ${CT_BASE_URL}...`);
    const ctClient = new ChurchToolsClient(CT_BASE_URL, CT_TOKEN);

    try {
        console.log('Fetching services...');
        const services = await ctClient.getServices();
        console.log(`Found ${services.length} services:`);

        // Print header
        console.log('ID'.padEnd(10) + ' | ' + 'Name');
        console.log('-'.repeat(30));

        services.forEach((s: any) => {
            console.log(String(s.id).padEnd(10) + ' | ' + s.name);
        });

    } catch (e: any) {
        console.error('Error during discovery:', e.message);
    }
}

discoverServices();
