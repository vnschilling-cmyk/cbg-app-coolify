
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function checkGroups() {
    try {
        const res = await fetch(`${CT_URL}/api/groups`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await res.json();
        console.log('ChurchTools Groups:');
        data.data.forEach(g => {
            console.log(`${g.name}: ${g.id}`);
        });
    } catch (err) {
        console.error('Failed to fetch groups:', err.message);
    }
}

checkGroups();
