import PocketBase from 'pocketbase';

async function finalTest() {
    const configs = [
        { url: 'https://pocketbase-cbg-app-coolify.195.201.231.49.nip.io', email: 'admin@cbg-app.de' },
        { url: 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io', email: 'admin@nik-app.de' },
        { url: 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io', email: 'admin@cbg-app.de' }
    ];

    // The password from the screenshot. The quotes might be the issue if they are literal.
    const passwords = ['Muenze1980!#', "'Muenze1980!#'"];

    for (const config of configs) {
        console.log(`\n--- Testing URL: ${config.url} ---`);
        const pb = new PocketBase(config.url);

        try {
            console.log(`Checking health...`);
            const health = await fetch(`${config.url}/api/health`).then(r => r.status);
            console.log(`Health status: ${health}`);
        } catch (e: any) {
            console.log(`Health check failed: ${e.message}`);
        }

        for (const pw of passwords) {
            try {
                console.log(`Trying Login: ${config.email} / ${pw}`);
                await pb.admins.authWithPassword(config.email, pw);
                console.log('>>> LOGIN SUCCESS! <<<');

                try {
                    const collections = await pb.collections.getList(1, 10);
                    console.log(`Found ${collections.items.length} collections.`);
                    if (collections.items.find(c => c.name === 'plans')) {
                        console.log('!!! PLANS COLLECTION EXISTS !!!');
                    }
                } catch (e) { }

                return;
            } catch (e: any) {
                console.log(`Login FAILED: ${e.message}`);
            }
        }
    }
}

finalTest();
