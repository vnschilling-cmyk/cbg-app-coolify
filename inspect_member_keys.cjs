
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function inspectMemberKeys() {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=1`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();
        const member = data.data[0];
        console.log('Member object keys:', Object.keys(member));
        console.log('Member object values:');
        Object.entries(member).forEach(([key, val]) => {
            if (typeof val !== 'object' || val === null) {
                console.log(` - ${key}: ${val}`);
            } else {
                console.log(` - ${key}: [Object]`);
            }
        });
    } catch (error) {
        console.error('Error fetching member:', error.message);
    }
}

inspectMemberKeys();
