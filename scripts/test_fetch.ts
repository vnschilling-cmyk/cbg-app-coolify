async function test() {
    try {
        console.log('Fetching http://127.0.0.1:8090/api/health...');
        const res = await fetch('http://127.0.0.1:8090/api/health');
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('JSON:', json);
    } catch (e: any) {
        console.error('Fetch failed:', e.message);
    }
}
test();
