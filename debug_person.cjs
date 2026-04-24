
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

async function debug() {
    try {
        const groupData = await request('groups/164/members');
        const firstMember = groupData.data[0];
        console.log('Member 0 ID:', firstMember.personId);

        const personData = await request(`persons/${firstMember.personId}`);
        console.log('Person Details:', JSON.stringify(personData.data, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debug();
