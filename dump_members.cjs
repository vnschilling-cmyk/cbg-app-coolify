
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function dumpMembers() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD.replace(/'/g, ''));

    const members = await pb.collection('members').getFullList({
        filter: 'group="5hpellypk3xh522"', // Preacher group ID
        sort: 'name'
    });

    console.log('Members in PB for group 164:');
    members.forEach(m => {
        console.log(` - ${m.name}: Role="${m.role}"`);
    });
}

dumpMembers();
