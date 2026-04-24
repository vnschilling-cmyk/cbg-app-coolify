
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function checkViktorCT() {
    console.log('Checking for Viktor Enns in ChurchTools...');

    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=100`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();

        const viktors = data.data.filter(m => {
            const name = `${m.person?.domainAttributes?.firstName} ${m.person?.domainAttributes?.lastName}`;
            return name.includes('Viktor Enns');
        });

        console.log(`Found ${viktors.length} records for Viktor Enns in CT:`);
        viktors.forEach(m => {
            const name = `${m.person?.domainAttributes?.firstName} ${m.person?.domainAttributes?.lastName}`;
            console.log(` - ID: ${m.personId}, Name: "${name}", RoleID: ${m.groupTypeRoleId}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkViktorCT();
