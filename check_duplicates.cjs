
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function checkDuplicates() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD.replace(/'/g, ''));

    const group = await pb.collection('groups').getFirstListItem('ct_id="164"');
    console.log(`Checking members for group ${group.name} (${group.id})...`);

    const members = await pb.collection('members').getFullList({
        filter: `group="${group.id}"`
    });

    console.log(`Total members found: ${members.length}`);

    const nameCount = {};
    members.forEach(m => {
        nameCount[m.name] = (nameCount[m.name] || 0) + 1;
    });

    const duplicates = Object.keys(nameCount).filter(name => nameCount[name] > 1);

    if (duplicates.length > 0) {
        console.log('DUPLICATES FOUND:');
        duplicates.forEach(name => {
            console.log(` - ${name}: ${nameCount[name]} entries`);
            const entries = members.filter(m => m.name === name);
            entries.forEach(e => {
                console.log(`   ID: ${e.id}, allowed_services: ${JSON.stringify(e.allowed_services)}`);
            });
        });
    } else {
        console.log('No duplicates found by name.');
    }
}

checkDuplicates();
