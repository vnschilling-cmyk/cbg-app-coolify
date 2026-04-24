
import PocketBase from 'pocketbase';
import 'dotenv/config';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function migrate() {
    const pb = new PocketBase(PB_URL);

    try {
        console.log(`Logging in as ${ADMIN_EMAIL}...`);
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log('Login successful.');

        const collection = await pb.collections.getOne('service_rules');

        // Define desired fields
        const desiredFields = [
            { name: 'name', type: 'text', required: false },
            { name: 'weekday', type: 'text', required: true },
            { name: 'time', type: 'text', required: true },
            { name: 'nth_sunday', type: 'number', required: false },
            { name: 'allowed_services', type: 'json', required: true },
            { name: 'max_assignments', type: 'json', required: false }
        ];

        let updated = false;
        for (const desired of desiredFields) {
            const existing = collection.fields.find(f => f.name === desired.name);
            if (!existing) {
                collection.fields.push(desired);
                updated = true;
                console.log(`Adding field: ${desired.name}`);
            }
        }

        if (updated) {
            await pb.collections.update(collection.id, collection);
            console.log('Collection "service_rules" updated successfully.');
        } else {
            console.log('Collection "service_rules" already has all desired fields.');
        }

        console.log('Migration complete.');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
