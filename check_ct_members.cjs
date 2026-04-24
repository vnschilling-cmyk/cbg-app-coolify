
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function checkMembers() {
    try {
        const res = await fetch(`${CT_URL}/api/groups/31/members`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await res.json();
        console.log('Group 31 Members:');
        data.data.forEach(m => {
            console.log(`${m.person.domainAttributes.firstName} ${m.person.domainAttributes.lastName}`);
        });
    } catch (err) {
        console.error('Failed to fetch members:', err.message);
    }
}

checkMembers();
