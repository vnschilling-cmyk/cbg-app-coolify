import PocketBase from 'pocketbase';

async function checkCollections() {
    const urls = [
        'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io',
        'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io'
    ];

    for (const url of urls) {
        console.log(`\nChecking URL: ${url}`);
        const pb = new PocketBase(url);

        try {
            // Try to list users (usually guest visible for existence check if not rules)
            // or just check health/status
            const list = await pb.collection('users').getList(1, 1);
            console.log(`- 'users' collection exists and is listable!`);
        } catch (e: any) {
            console.log(`- 'users' list failed (${e.status}): ${e.message}`);
        }

        try {
            const list = await pb.collection('preachers').getList(1, 1);
            console.log(`- 'preachers' collection exists and is listable!`);
        } catch (e: any) {
            console.log(`- 'preachers' list failed (${e.status}): ${e.message}`);
        }
    }
}

checkCollections();
