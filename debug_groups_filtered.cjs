
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

function listGroups() {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing CT config');
        return;
    }
    const baseUrl = CT_BASE_URL.endsWith('/') ? CT_BASE_URL.slice(0, -1) : CT_BASE_URL;
    const url = `${baseUrl}/api/groups?limit=500`; // Increased limit

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
                const groups = json.data || [];
                console.log('--- CHURCHTOOLS GROUPS ---');
                groups.forEach((g) => {
                    if (g.name.toLowerCase().includes('prediger') || g.name.toLowerCase().includes('bruder')) {
                        console.log(`ID: ${g.id} | Name: ${g.name}`);
                    }
                });
            } catch (e) {
                console.error('Failed to parse response:', e.message);
            }
        });
    }).on('error', (err) => {
        console.error('Error fetching groups:', err.message);
    });
}

listGroups();
