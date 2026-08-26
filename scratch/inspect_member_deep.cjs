
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function inspectMemberDeep() {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=1`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();
        const member = data.data[0];
        console.log('Member object:', JSON.stringify(member, null, 2));
    } catch (error) {
        console.error('Error fetching member:', error.message);
    }
}

inspectMemberDeep();
