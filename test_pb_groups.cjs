
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

async function checkPB() {
    const pbUrl = process.env.PUBLIC_POCKETBASE_URL;
    const adminEmail = process.env.PB_ADMIN_EMAIL;
    const adminPassword = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    const pb = new PocketBase(pbUrl);

    try {
        await pb.admins.authWithPassword(adminEmail, adminPassword);

        console.log('\n--- TARGET: Bruderrat group in PB ---');
        const bruderratGroup = await pb.collection('groups').getFirstListItem('ct_id="31"');
        console.log(`Bruderrat ID in PB: ${bruderratGroup.id}`);

        console.log('\n--- Fetching Users ---');
        const users = await pb.collection('users').getFullList();

        const viktors = users.filter(u =>
            (u.name && u.name.includes('Viktor')) ||
            (u.username && u.username.includes('Viktor'))
        );

        if (viktors.length === 0) {
            console.log('User Viktor not found in local filtering.');
            return;
        }

        viktors.forEach(u => {
            console.log(`\nChecking User: ${u.name} (${u.username})`);
            console.log('Groups in Record:', JSON.stringify(u.groups));

            const userGroupIds = Array.isArray(u.groups) ? u.groups : (u.groups ? [u.groups] : []);
            const hasAccess = userGroupIds.includes(bruderratGroup.id);
            console.log(`Has Bruderrat Access? ${hasAccess ? 'YES' : 'NO'}`);

            if (!hasAccess) {
                console.log(`\nCONFIRMED: Viktor is missing the group ID "${bruderratGroup.id}" in PocketBase.`);
                console.log('This is why the tile is grayed out.');
            } else {
                console.log(`\nWAIT: Viktor HAS the group ID. If it's still grayed out, there might be a UI/Hydration issue.`);
            }
        });

    } catch (err) {
        console.error('Debug failed:', err.message);
    }
}

checkPB();
