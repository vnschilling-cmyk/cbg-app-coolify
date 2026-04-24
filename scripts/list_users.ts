import PocketBase from 'pocketbase';

async function checkUsers() {
    const url = 'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io';
    console.log(`Checking URL: ${url}`);
    const pb = new PocketBase(url);

    try {
        const list = await pb.collection('users').getList(1, 10);
        console.log(`Found ${list.items.length} users.`);
        list.items.forEach(u => console.log(`- ${u.email} (${u.id})`));
    } catch (e: any) {
        console.log(`Failed to list users (${e.status}): ${e.message}`);
    }
}

checkUsers();
