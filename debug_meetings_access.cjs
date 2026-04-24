
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

async function debugAccess() {
    const pbUrl = process.env.PUBLIC_POCKETBASE_URL;
    const adminEmail = process.env.PB_ADMIN_EMAIL;
    // Handle potential quotes in password from .env
    const adminPassword = process.env.PB_ADMIN_PASSWORD.replace(/^['"]|['"]$/g, '');

    console.log('Connecting to:', pbUrl);
    console.log('Admin Email:', adminEmail);

    const pb = new PocketBase(pbUrl);

    try {
        await pb.collection('users').authWithPassword(adminEmail, adminPassword);
        console.log('Authenticated as admin.');

        console.log('\n--- Current Groups in PB ---');
        const groups = await pb.collection('groups').getFullList();
        groups.forEach(g => console.log(`${g.name}: ${g.id} (CT ID: ${g.ct_id || 'N/A'})`));

        console.log('\n--- Viktor Context ---');
        const users = await pb.collection('users').getFullList({
            filter: 'name ~ "Viktor" || username ~ "Viktor"'
        });

        if (users.length === 0) {
            console.log('No user "Viktor" found.');
            return;
        }

        users.forEach(viktor => {
            console.log('\nUser found:');
            console.log('ID:', viktor.id);
            console.log('Name:', viktor.name);
            console.log('Username:', viktor.username);
            console.log('Groups in User Record (raw):', viktor.groups);

            const userGroupIds = Array.isArray(viktor.groups) ? viktor.groups : (viktor.groups ? [viktor.groups] : []);

            console.log('\n--- Accessible Groups for this record ---');
            const accessible = groups.filter(g => userGroupIds.includes(g.id));
            console.log('Groups accessible:', accessible.map(g => g.name));

            const inaccessible = groups.filter(g => !userGroupIds.includes(g.id));
            console.log('Groups inaccessible:', inaccessible.map(g => g.name));
        });

    } catch (err) {
        console.error('Debug failed:', err.message);
        if (err.response) {
            console.error('Response data:', JSON.stringify(err.response.data, null, 2));
        }
    }
}

debugAccess();
