import PocketBase from 'pocketbase';

async function run() {
    console.log('Connecting to PocketBase...');
    const pb = new PocketBase('http://pocketbase-cbg-app-coolify.195.201.231.49.nip.io');
    try {
        console.log('Fetching meetings...');
        const meetings = await pb.collection('meetings').getList(1, 10, {
            filter: 'date >= "2026-02-20 00:00:00" && date <= "2026-02-22 00:00:00"'
        });
        if (meetings.items.length === 0) {
            console.log('No meetings found in range. Fetching ALL meetings...');
            const all = await pb.collection('meetings').getList(1, 5, { sort: '-created' });
            console.log('Sample meetings:', JSON.stringify(all.items.map(m => ({ id: m.id, date: m.date })), null, 2));
        } else {
            console.log('Found meetings:');
            console.log(JSON.stringify(meetings.items.map(m => ({
                id: m.id,
                name: m.name,
                date: m.date
            })), null, 2));
        }
    } catch (e: any) {
        console.error('PB Error:', e.message);
        if (e.data) console.error('Error data:', JSON.stringify(e.data, null, 2));
    }
}

run();
