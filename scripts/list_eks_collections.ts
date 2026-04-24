import PocketBase from 'pocketbase';

async function listAll() {
    const url = 'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io';
    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    console.log(`Connecting to ${url} as ${email}...`);
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Auth SUCCESS');

        const collections = await pb.collections.getFullList();
        console.log('Collections:');
        collections.forEach(c => console.log(`- ${c.name}`));
    } catch (e: any) {
        console.error(`FAILED: ${e.message}`, e.response?.data);
    }
}

listAll();
