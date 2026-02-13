
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

async function debugSkippedMembers() {
    try {
        console.log('Fetching all members of group 164 with limit=1000...');
        const response = await requestCT('groups/164/members?limit=1000');
        const members = response.data || [];
        console.log(`Found ${members.length} members in total.`);

        let skippedNoEmail = 0;
        let skippedNoName = 0;
        let valid = 0;

        for (const m of members) {
            let person = m.person || m;
            let email = person.email;
            let name = m.groupMemberDisplayName;

            if (!email && m.personId) {
                // Try fetching full person
                const personDetails = await requestCT(`persons/${m.personId}`);
                person = personDetails.data || person;
                email = person.email;
            }

            if (!email) {
                console.log(` - SKIP: ${name} (No Email)`);
                skippedNoEmail++;
            } else if (!name) {
                console.log(` - SKIP: ID ${m.personId} (No Name)`);
                skippedNoName++;
            } else {
                valid++;
            }
        }

        console.log(`\nResults:`);
        console.log(`- Total: ${members.length}`);
        console.log(`- Valid: ${valid}`);
        console.log(`- Skipped (No email): ${skippedNoEmail}`);
        console.log(`- Skipped (No name): ${skippedNoName}`);

    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugSkippedMembers();
