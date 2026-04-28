import PocketBase from 'pocketbase';
import dotenv from 'dotenv';
dotenv.config();

async function checkUsers() {
    const url = process.env.PUBLIC_POCKETBASE_URL || 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io';
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(
            process.env.PB_ADMIN_EMAIL!,
            process.env.PB_ADMIN_PASSWORD!
        );
        const list = await pb.collection('users').getFullList();
        console.log(`Found ${list.length} users:`);
        list.forEach(u => console.log(`- ${u.name} / ${u.email}`));
    } catch (e: any) {
        console.log(`Error: ${e.message}`);
    }
}

checkUsers();
