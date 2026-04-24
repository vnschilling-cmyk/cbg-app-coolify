
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function listMemberRoles() {
    try {
        const response = await fetch(`${CT_URL}/api/groups/164/members?limit=100`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();

        console.log('Member Roles (groupTypeRoleId):');
        data.data.forEach((member) => {
            const name = `${member.person?.domainAttributes?.firstName} ${member.person?.domainAttributes?.lastName}`;
            console.log(` - ${name}: groupTypeRoleId=${member.groupTypeRoleId}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}

listMemberRoles();
