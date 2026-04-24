const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function fix() {
    const email = process.env.PB_ADMIN_EMAIL;
    const password = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Authenticated as admin.');

        const groups = await pb.collection('groups').getFullList();
        const bruderratGroup = groups.find(g => g.ct_id === '31');

        if (!bruderratGroup) {
            console.error('Bruderrat group not found in PB.');
            return;
        }

        const meetings = await pb.collection('meetings').getFullList({
            filter: 'group = ""'
        });

        console.log(`Found ${meetings.length} meetings without group.`);

        for (const meeting of meetings) {
            if (meeting.title.toLowerCase().includes('bruderrat')) {
                console.log(`Updating meeting "${meeting.title}" (${meeting.id}) -> Bruderrat (${bruderratGroup.id})`);
                await pb.collection('meetings').update(meeting.id, {
                    group: bruderratGroup.id
                });
            } else {
                console.log(`Skipping meeting "${meeting.title}" (${meeting.id}) - title does not match Bruderrat.`);
            }
        }

        console.log('Fix complete.');

    } catch (err) {
        console.error('Error:', err.message);
    }
}

fix();
