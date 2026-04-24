const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function inspect() {
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD.replace(/'/g, ''));
    const collections = await pb.collections.getFullList();
    collections.forEach(c => {
        console.log(`Collection: ${c.name} (${c.id})`);
        console.log('Schema:', JSON.stringify(c.schema, null, 2));
        console.log('---');
    });
}

inspect();
