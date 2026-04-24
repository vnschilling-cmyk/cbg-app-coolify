import PocketBase from 'pocketbase';

async function testEmails() {
    const url = 'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io';
    const emails = ['vschilling@nik-app.de', 'v.schilling@nik-app.de', 'viktor.schilling@nik-app.de', 'admin@cbg-app-coolify.195.201.231.49.nip.io'];
    const password = 'Muenze1980!#';

    console.log(`Testing emails on ${url}...`);
    const pb = new PocketBase(url);

    for (const email of emails) {
        try {
            process.stdout.write(`Trying ${email}... `);
            await pb.admins.authWithPassword(email, password);
            console.log('SUCCESS!');
            return;
        } catch (e) {
            console.log('failed');
        }
    }
}

testEmails();
