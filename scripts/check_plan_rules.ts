import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkRules() {
    const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

    console.log('Testing GUEST create...');
    try {
        await pb.collection('plans').create({
            period_start: new Date().toISOString(),
            period_end: new Date().toISOString(),
            status: 'draft',
            data: {},
        });
        console.log('Guest create: SUCCESS');
    } catch (e: any) {
        console.log(`Guest create: FAILED (${e.status}): ${e.message}`);
    }

    // Try to find if there's a test user
    console.log('\nTesting USER create (if possible)...');
    // We don't have a user login here, but we can see if we can get a list
    try {
        const list = await pb.collection('plans').getList(1, 1);
        console.log('Guest list: SUCCESS');
    } catch (e: any) {
        console.log(`Guest list: FAILED (${e.status}): ${e.message}`);
    }
}

checkRules();
