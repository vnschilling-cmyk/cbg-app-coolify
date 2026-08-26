
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

async function checkRoles() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD.replace(/'/g, ''));

    const members = await pb.collection('members').getFullList({
        filter: 'group="5hpellypk3xh522"' // Preacher group ID from previous check
    });

    const roles = new Set();
    members.forEach(m => roles.add(m.role));

    console.log('Roles found in PB members:');
    roles.forEach(r => {
        const count = members.filter(m => m.role === r).length;
        console.log(` - "${r}": ${count} members`);
    });
}

checkRoles();
