
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function inspectMember() {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=1`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();
        console.log('Member object sample:');
        console.log(JSON.stringify(data.data[0], null, 2));
    } catch (error) {
        console.error('Error fetching member:', error.message);
    }
}

inspectMember();
