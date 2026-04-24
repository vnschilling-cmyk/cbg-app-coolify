import PocketBase from 'pocketbase';

async function init() {
    const url = 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io';
    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    console.log(`Connecting to ${url} as ${email}...`);
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Auth SUCCESS');

        const collectionData = {
            name: 'plans',
            type: 'base',
            schema: [
                { name: 'period_start', type: 'date', required: true },
                { name: 'period_end', type: 'date', required: true },
                { name: 'data', type: 'json' },
                { name: 'status', type: 'select', options: { values: ['draft', 'published', 'archived'] } }
            ],
            listRule: '',
            viewRule: '',
            createRule: '',
            updateRule: '',
            deleteRule: '',
        };

        try {
            await pb.collections.create(collectionData);
            console.log('Collection "plans" created successfully.');
        } catch (e: any) {
            if (e.status === 400) {
                console.log('Collection "plans" already exists.');
            } else {
                throw e;
            }
        }
    } catch (e: any) {
        console.error(`FAILED: ${e.message}`, e.response?.data);
    }
}

init();
