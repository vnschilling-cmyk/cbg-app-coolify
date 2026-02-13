
import PocketBase from 'pocketbase';
import 'dotenv/config';

async function inspectCollections() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

    const collectionsToInspect = ['plans', 'events', 'members', 'preachers', 'absences'];

    for (const name of collectionsToInspect) {
        try {
            const collection = await pb.collections.getOne(name);
            console.log(`--- ${collection.name} ---`);
            const fields = collection.schema || collection.fields || [];
            fields.forEach(f => {
                console.log(`${f.name}: ${f.type}`);
            });
        } catch (e) {
            console.log(`Failed to inspect ${name}: ${e.message}`);
        }
    }
}

inspectCollections().catch(console.error);
