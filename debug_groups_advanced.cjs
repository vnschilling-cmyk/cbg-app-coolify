
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function listGroupsWithMemberCount() {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing CT config');
        return;
    }
    const baseUrl = CT_BASE_URL.endsWith('/') ? CT_BASE_URL.slice(0, -1) : CT_BASE_URL;
    const url = `${baseUrl}/api/groups?limit=1000`;

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
                // Since fetching member count for each group would be many requests,
                // let's just focus on finding any group that sounds like "Prediger" or "Verkündigung" or similar.
                groups.forEach((g) => {
                    const name = g.name.toLowerCase();
                    if (name.includes('predig') || name.includes('verk') || name.includes('lehre') || name.includes('bruder') || name.includes('dienst') || name.includes('plan')) {
                        console.log(`ID: ${g.id} | Name: ${g.name}`);
                    }
                });

                // Also log the first 20 groups just in case
                console.log('--- FIRST 20 GROUPS ---');
                groups.slice(0, 20).forEach((g) => {
                    console.log(`ID: ${g.id} | Name: ${g.name}`);
                });

            } catch (e) {
                console.error('Failed to parse response:', e.message);
            }
        });
    }).on('error', (err) => {
        console.error('Error fetching groups:', err.message);
    });
}

listGroupsWithMemberCount();
