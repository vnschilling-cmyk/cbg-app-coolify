import dotenv from 'dotenv';
dotenv.config();

const baseUrl = process.env.CHURCHTOOLS_BASE_URL;
const token = process.env.CHURCHTOOLS_TOKEN;

async function debugFetch() {
    if (!baseUrl || !token) return;

    const headersList = [
        { 'Authorization': `Login ${token}` },
        { 'Authorization': `Bearer ${token}` },
        { 'Authorization': `Token ${token}` },
        { 'X-Auth-Token': token }
    ];

    for (const headers of headersList) {
        console.log(`Testing with headers: ${Object.keys(headers)[0]}`);
        try {
            const resp = await fetch(`${baseUrl}/api/whoami`, { headers });
            const text = await resp.text();
            console.log(`Status: ${resp.status}, Type: ${resp.headers.get('content-type')}`);
            if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
                console.log('SUCCESS!');
                console.log(text.substring(0, 200));
                return;
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
}

debugFetch();
