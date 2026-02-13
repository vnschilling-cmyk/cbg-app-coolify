
import PocketBase from 'pocketbase';
import 'dotenv/config';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function migrate() {
    console.log(`Connecting to ${PB_URL}...`);
    const pb = new PocketBase(PB_URL);

    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);
        console.log('Authenticated as Admin.');
    } catch (e: any) {
        console.error('Auth failed:', e.message);
        process.exit(1);
    }

    try {
        const membersCol = await pb.collections.getOne('members');
        const hasCtId = membersCol.fields?.find((f: any) => f.name === 'ct_id');

        if (!hasCtId) {
            membersCol.fields.push({
                name: 'ct_id',
                type: 'text',
                required: false,
            });
            await pb.collections.update('members', membersCol);
            console.log("✅ Added 'ct_id' field to 'members' collection.");
        } else {
            console.log("ℹ️ 'members' already has 'ct_id' field.");
        }
    } catch (e: any) {
        console.error("❌ Failed to update 'members':", e.message);
    }
}

migrate();
