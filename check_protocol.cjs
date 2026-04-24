const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function check() {
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD.replace(/'/g, ''));
    const protocolItems = await pb.collections.getOne('protocol_items');
    console.log('Fields:', JSON.stringify(protocolItems.schema, null, 2));
}

check();
