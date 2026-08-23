
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
// Handle quotes in password
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ? process.env.PB_ADMIN_PASSWORD.replace(/^'|'$/g, '') : '';

async function checkViktor() {
    console.log('Checking for Viktor Enns in PB...');
    const pb = new PocketBase(PB_URL);

    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

        // Find Prediger Group
        const group = await pb.collection('groups').getFirstListItem('ct_id="164"');

        const records = await pb.collection('members').getFullList({
            filter: `group="${group.id}" && name ~ "Viktor Enns"`
        });

        console.log(`Found ${records.length} records for Viktor Enns:`);
        records.forEach(r => {
            console.log(` - ID: ${r.id}, Name: "${r.name}", Role: "${r.role}"`);
        });

    } catch (e) {
        console.error('Error:', e);
    }
}

checkViktor();
