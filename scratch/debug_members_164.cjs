
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

function listMembers(groupId) {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing CT config');
        return;
    }
    const baseUrl = CT_BASE_URL.endsWith('/') ? CT_BASE_URL.slice(0, -1) : CT_BASE_URL;
    const url = `${baseUrl}/api/groups/${groupId}/members`;

    const options = {
        headers: {
            'Authorization': `Login ${CT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    };

    https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                const members = json.data || [];
                console.log(`--- MEMBERS OF GROUP ${groupId} ---`);
                if (members.length > 0) {
                    console.log('Sample member:', JSON.stringify(members[0], null, 2));
                }
                members.forEach((m) => {
                    const p = m.person || m;
                    console.log(`${p.firstName} ${p.lastName}`);
                });
            } catch (e) {
                console.error('Failed to parse response:', e.message);
            }
        });
    }).on('error', (err) => {
        console.error('Error fetching members:', err.message);
    });
}

listMembers(164);
