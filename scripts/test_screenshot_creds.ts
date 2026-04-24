import PocketBase from 'pocketbase';

async function testNewCreds() {
    const url = 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io';
    const email = 'admin@cbg-app.de';
    // Test with and without quotes
    const passwords = ['Muenze1980!#', "'Muenze1980!#'"];

    console.log(`Testing credentials on ${url}...`);
    const pb = new PocketBase(url);

    for (const pw of passwords) {
        try {
            console.log(`Trying ${email} with password: ${pw}`);
            await pb.admins.authWithPassword(email, pw);
            console.log('SUCCESS!');
            return;
        } catch (e: any) {
            console.log(`FAILED: ${e.message}`);
        }
    }
}

testNewCreds();
