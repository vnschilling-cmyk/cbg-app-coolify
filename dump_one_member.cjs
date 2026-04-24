
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function dumpOneMember() {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=1`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();
        fs.writeFileSync('one_member.json', JSON.stringify(data.data[0], null, 2));
        console.log('One member dumped to one_member.json');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

dumpOneMember();
