import PocketBase from 'pocketbase';

async function checkRules() {
    const url = 'https://pocketbase-nik-app-coolify.195.201.231.49.nip.io';
    console.log(`Testing URL: ${url}`);
    const pb = new PocketBase(url);

    // Bypass SSL for this test if needed
    // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    console.log('Testing GUEST list on plans...');
    try {
        const list = await pb.collection('plans').getList(1, 1);
        console.log('Guest list: SUCCESS');
        console.log('Plans found:', list.items.length);
    } catch (e: any) {
        console.log(`Guest list: FAILED (${e.status}): ${e.message}`);
    }

    console.log('\nTesting GUEST list on collections (should fail but check status)...');
    try {
        await pb.collections.getList(1, 1);
        console.log('Collections list: SUCCESS');
    } catch (e: any) {
        console.log(`Collections list: FAILED (${e.status}): ${e.message}`);
    }
}

checkRules();
