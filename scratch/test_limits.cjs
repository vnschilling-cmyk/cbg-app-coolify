
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function requestCT(path) {
    const baseUrl = CT_BASE_URL.endsWith('/') ? CT_BASE_URL.slice(0, -1) : CT_BASE_URL;
    const url = `${baseUrl}/api/${path}`;
    const options = {
        headers: {
            'Authorization': `Login ${CT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Status: ${res.statusCode}, Body: ${data}`));
                    return;
                }
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function testLimit1000() {
    try {
        console.log('Testing limit=1000...');
        const response = await requestCT('groups/164/members?limit=1000');
        console.log('Success with 1000! Count:', response.data.length);
    } catch (e) {
        console.error('Failed with 1000:', e.message);

        try {
            console.log('Testing limit=100...');
            const response = await requestCT('groups/164/members?limit=100');
            console.log('Success with 100! Count:', response.data.length);
        } catch (e2) {
            console.error('Failed with 100 too:', e2.message);
        }
    }
}

testLimit1000();
