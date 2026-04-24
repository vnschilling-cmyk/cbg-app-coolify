import PocketBase from 'pocketbase';

async function checkMembers() {
    const url = 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io';
    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    console.log(`Connecting to ${url} as ${email}...`);
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Login SUCCESS');

        const members = await pb.collection('members').getFullList({
            sort: 'name'
        });

        console.log(`Found ${members.length} members.`);
        members.forEach(m => {
            console.log(`- ${m.name} (ct_id: ${m.ct_id}, pb_id: ${m.id})`);
        });
    } catch (e: any) {
        console.error('Error:', e.message, e.response?.data);
    }
}

checkMembers();
