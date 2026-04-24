import PocketBase from 'pocketbase';

async function testAll() {
    const urls = [
        'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io',
        'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io',
        'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io',
        'http://pocketbase-cbg-app-coolify.195.201.231.49.nip.io'
    ];

    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    // Also try without the hash in subdomain if it's there

    for (const url of urls) {
        console.log(`\nTesting ${url}...`);
        const pb = new PocketBase(url);
        try {
            await pb.admins.authWithPassword(email, password);
            console.log('SUCCESS!');
            const collections = await pb.collections.getFullList();
            console.log('Collections:', collections.map(c => c.name).join(', '));
        } catch (e: any) {
            console.log(`FAILED (${e.status}): ${e.message}`);
        }
    }
}

testAll();
