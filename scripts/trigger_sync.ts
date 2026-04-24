async function run() {
    const meetingId = 'r7lwcwjazyz0qis';
    console.log(`Triggering sync for meeting ${meetingId}...`);
    try {
        const response = await fetch('http://localhost:5173/api/meetings/sync-ct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetingId })
        });
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.error('Fetch Error:', e.message);
    }
}

run();
