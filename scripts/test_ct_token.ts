import dotenv from 'dotenv';
dotenv.config();

const CT_URLS = [process.env.CHURCHTOOLS_BASE_URL, 'https://cbggruenberg.church.tools'];
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function testCT() {
    console.log(`Token length: ${CT_TOKEN?.length || 0}`);

    for (const url of CT_URLS) {
        if (!url) continue;
        console.log(`\nTesting ChurchTools at ${url}...`);

        try {
            const res = await fetch(`${url}/api/whoami`, {
                headers: { Authorization: `Login ${CT_TOKEN}` }
            });

            console.log(`Status: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.log(`Response start: ${text.substring(0, 200)}`);

            if (res.ok) {
                try {
                    const json = JSON.parse(text);
                    console.log('SUCCESS: Valid JSON received');
                    console.log('User:', json.data?.firstName, json.data?.lastName);
                } catch (e) {
                    console.log('FAILED: Response is not JSON');
                }
            } else {
                console.log('FAILED: Request not OK');
            }
        } catch (e: any) {
            console.error('ERROR:', e.message);
        }
    }
}

testCT();
