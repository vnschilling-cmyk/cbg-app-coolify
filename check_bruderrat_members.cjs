const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function check() {
    const email = process.env.PB_ADMIN_EMAIL;
    const password = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Authenticated as admin.');

        const groups = await pb.collection('groups').getFullList();
        console.log('Available Groups:');
        groups.forEach(g => console.log(`- ${g.name} (ID: ${g.id}, CT_ID: ${g.ct_id})`));

        for (const group of groups) {
            console.log(`\nMembers for group "${group.name}" (${group.id}):`);
            const members = await pb.collection('members').getFullList({
                filter: `group="${group.id}"`
            });
            console.log(`Total: ${members.length}`);
            members.forEach(m => console.log(`  - ${m.name} (ID: ${m.id}, CT_ID: ${m.ct_id})`));
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

check();
