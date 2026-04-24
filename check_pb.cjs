const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function check() {
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD.replace(/'/g, ''));
    const meetings = await pb.collections.getOne('meetings');
    console.log('Meetings Keys:', Object.keys(meetings));
    if (meetings.schema) console.log('Schema is present');
    if (meetings.fields) console.log('Fields is present');
    console.log('JSON:', JSON.stringify(meetings, null, 2));
}

check();
