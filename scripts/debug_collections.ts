
import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function listCollections() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

    const collections = await pb.collections.getFullList();
    console.log('Collections:');
    collections.forEach(c => {
        console.log(`- ${c.name} (${c.id})`);
        console.log('  Fields:', c.schema.map(f => `${f.name} (${f.type})`).join(', '));
    });
}

listCollections().catch(console.error);
