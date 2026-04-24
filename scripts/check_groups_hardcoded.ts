import PocketBase from 'pocketbase';

async function checkGroups() {
    const url = 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io';
    const email = 'admin@nik-app.de';
    const password = 'Muenze1980!#';

    console.log(`Connecting to ${url} as ${email}...`);
    const pb = new PocketBase(url);

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Login SUCCESS');

        const groups = await pb.collection('groups').getFullList();
        console.log('Available Groups:');
        groups.forEach(g => console.log(`- ${g.name} (ct_id: ${g.ct_id}, id: ${g.id})`));

        const members = await pb.collection('members').getFullList();
        console.log(`\nTotal members: ${members.length}`);
        if (members.length > 0) {
            console.log('Sample member:', members[0].name, 'allowed_services:', members[0].allowed_services);
        }
    } catch (e: any) {
        console.error('Error:', e.message, e.response?.data);
    }
}

checkGroups();
