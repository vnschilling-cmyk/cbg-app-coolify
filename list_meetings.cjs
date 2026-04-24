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

        const meetings = await pb.collection('meetings').getFullList({
            expand: 'group'
        });

        console.log('Meetings:');
        meetings.forEach(m => {
            console.log(`- Title: ${m.title}`);
            console.log(`  ID: ${m.id}`);
            console.log(`  Group: ${m.expand?.group?.name} (ID: ${m.group})`);
            console.log(`  Date: ${m.date}`);
            console.log('---');
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

check();
