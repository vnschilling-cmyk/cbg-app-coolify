import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config();

async function checkGroups() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL!, process.env.PB_PASSWORD!);

    try {
        const groups = await pb.collection('groups').getFullList();
        console.log('Available Groups:');
        groups.forEach(g => console.log(`- ${g.name} (ct_id: ${g.ct_id}, id: ${g.id})`));
    } catch (e: any) {
        console.error('Error fetching groups:', e.message);
    }
}

checkGroups();
