
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function request(path) {
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

async function countMembers(groupId) {
    try {
        const response = await request(`groups/${groupId}/members?limit=1000`);
        console.log(`Group ${groupId} total members (limit 1000):`, response.data ? response.data.length : 0);
        if (response.meta && response.meta.pagination) {
            console.log('Pagination info:', JSON.stringify(response.meta.pagination));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

countMembers(164);
