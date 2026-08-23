
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
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function debugPagination() {
    try {
        const response = await requestCT('groups/164/members');
        console.log('Total members in array:', response.data ? response.data.length : 0);
        console.log('Meta:', JSON.stringify(response.meta, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugPagination();
