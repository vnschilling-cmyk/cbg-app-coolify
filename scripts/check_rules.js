import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function check() {
    const pb = new PocketBase(PB_URL);
    try {
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        const rules = await pb.collection('service_rules').getFullList();
        console.log(`Found ${rules.length} service rules.`);
        rules.forEach(r => {
            console.log(`- ${r.weekday} at ${r.time} (Sun:${r.nth_sunday}): ${JSON.stringify(r.allowed_services)}`);
        });
    } catch (e) {
        console.error('Check failed:', e);
    }
}

check();
