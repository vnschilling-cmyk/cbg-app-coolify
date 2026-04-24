async function test() {
    const url = 'http://10.49.210.253:8080/api/health';
    try {
        console.log(`Fetching ${url}...`);
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        console.log('Status:', res.status);
        const json = await res.json();
        console.log('JSON:', json);
    } catch (e: any) {
        console.error('Fetch failed:', e.message);
    }
}
test();
