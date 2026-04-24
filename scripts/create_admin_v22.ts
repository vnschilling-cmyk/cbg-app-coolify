import PocketBase from 'pocketbase';

async function createAdmin() {
    const url = 'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io';
    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    console.log(`Attempting to create admin on ${url}...`);
    const pb = new PocketBase(url);

    try {
        // In PB 0.22+, the first admin creation is via /api/admins
        // or /api/collections/_superusers/records
        const res = await pb.collection('_superusers').create({
            email,
            password,
            passwordConfirm: password,
        });
        console.log('Admin created successfully!');
    } catch (e: any) {
        console.error(`Failed: ${e.message}`, e.response?.data);
    }
}

createAdmin();
