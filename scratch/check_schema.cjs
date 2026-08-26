
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function checkSchema() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD.replace(/'/g, ''));

    const members = await pb.collection('members').getList(1, 1);
    if (members.items.length > 0) {
        console.log('Member fields:', Object.keys(members.items[0]));
    } else {
        console.log('No members found to inspect fields.');
    }
}

checkSchema();
