
const PocketBase = require('pocketbase/cjs');
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

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

async function debugSyncStatus() {
    try {
        // 1. Check CT
        const ctResponse = await requestCT('groups/164/members?limit=1000');
        const ctMembers = ctResponse.data || [];
        console.log(`ChurchTools Group 164 member count: ${ctMembers.length}`);

        // 2. Check PB
        const pb = new PocketBase(PB_URL);
        if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
            await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
        }

        const pbGroup = await pb.collection('groups').getFirstListItem('ct_id="164"');
        console.log(`PocketBase Group 164 record ID: ${pbGroup.id}`);

        const pbMembers = await pb.collection('members').getFullList({
            filter: `group = "${pbGroup.id}"`
        });
        console.log(`PocketBase members associated with this group: ${pbMembers.length}`);
        pbMembers.forEach(m => console.log(` - ${m.name}`));

    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugSyncStatus();
