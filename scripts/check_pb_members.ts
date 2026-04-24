import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config();

async function checkMembers() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL!, process.env.PB_PASSWORD!);

    try {
        const members = await pb.collection('members').getFullList({
            sort: 'name'
        });

        console.log('PocketBase Members:');
        members.forEach(m => {
            console.log(`- ${m.name} (ct_id: ${m.ct_id}, pb_id: ${m.id})`);
        });
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

checkMembers();
