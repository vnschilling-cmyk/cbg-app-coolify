import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function testCreate() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

    const email = 'admin@nik-app.de';
    const passwords = ['Muenze1980!#', '"Muenze1980!#"', "'Muenze1980!#'"];

    let authed = false;
    for (const password of passwords) {
        try {
            console.log(`Trying password: ${password}`);
            await pb.admins.authWithPassword(email, password);
            console.log('Admin Auth Success!');
            authed = true;
            break;
        } catch (e: any) {
            console.error(`Failed with ${password}: ${e.message}`);
        }
    }

    if (!authed) {
        console.log('No valid admin session, attempting public create test...');
    }

    try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

        const newRecord = await pb.collection('plans').create({
            period_start: start.toISOString(),
            period_end: end.toISOString(),
            status: 'draft',
            data: { test: true },
        });

        console.log('Record created successfully:', newRecord.id);
    } catch (e: any) {
        console.error('Create failed:', e.message, e.response?.data);
    }
}

testCreate();
