
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function findValueInMember(targetValue) {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=20`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();

        data.data.forEach((member, idx) => {
            console.log(`Checking member ${idx}: ${member.person?.domainAttributes?.firstName} ${member.person?.domainAttributes?.lastName}`);

            function search(obj, path = '') {
                for (let key in obj) {
                    let val = obj[key];
                    let currentPath = path ? `${path}.${key}` : key;
                    if (val == targetValue) {
                        console.log(`  FOUND ${targetValue} at path: ${currentPath}`);
                    }
                    if (typeof val === 'object' && val !== null) {
                        search(val, currentPath);
                    }
                }
            }
            search(member);
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Search for 1226 (Teilnehmer) or 1229 (Leiter) or 20334 (Teilnehmer 2)
findValueInMember(1226);
findValueInMember(1229);
findValueInMember(20334);
