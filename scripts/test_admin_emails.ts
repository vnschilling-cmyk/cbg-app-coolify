import PocketBase from 'pocketbase';

async function testEmails() {
    const url = 'http://pocketbase-eks8ggs4k4000g0wswkw0804.195.201.231.49.nip.io';
    const emailPrefixes = ['admin', 'viktor', 'visc', 'gemeinde'];
    const emailDomains = ['nik-app.de', 'cbg-app.de', 'gmail.com', 'outlook.com'];
    const password = 'Muenze1980!#';

    console.log(`Testing multiple emails on ${url}...`);
    const pb = new PocketBase(url);

    for (const prefix of emailPrefixes) {
        for (const domain of emailDomains) {
            const email = `${prefix}@${domain}`;
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
}

testEmails();
