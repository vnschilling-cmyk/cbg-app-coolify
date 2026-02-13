
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
// Handle potential quotes in password
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ? process.env.PB_ADMIN_PASSWORD.replace(/^'|'$/g, '') : '';

const GROUP_ID = '164';

async function fixRoles() {
    console.log('Starting Manual Sync Fix...');
    const pb = new PocketBase(PB_URL);

    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
        console.log('Authenticated with PocketBase.');
    } catch (e) {
        console.error('PB Auth failed:', e.message);
        return;
    }

    // Fetch CT Members
    console.log('Fetching CT members...');
    try {
        const ctRes = await fetch(`${CT_URL}/api/groups/${GROUP_ID}/members?limit=100`, {
            headers: { Authorization: `Login ${CT_TOKEN}` }
        });
        const ctData = await ctRes.json();
        const ctMembers = ctData.data;

        // Create a map of Name -> groupTypeRoleId
        const nameMap = {};
        ctMembers.forEach(m => {
            // Try to construct name safely
            const firstName = m.person?.domainAttributes?.firstName || '';
            const lastName = m.person?.domainAttributes?.lastName || '';
            const name = `${firstName} ${lastName}`.trim();
            if (name) {
                nameMap[name] = m.groupTypeRoleId;
            }
        });

        // Fetch PB Members
        console.log('Fetching PB members...');
        const pbGroup = await pb.collection('groups').getFirstListItem(`ct_id="${GROUP_ID}"`);
        console.log(`Found PB Group ID: ${pbGroup.id}`);

        const pbMembers = await pb.collection('members').getFullList({
            filter: `group="${pbGroup.id}"`
        });

        console.log(`Found ${pbMembers.length} PB members. Updating roles...`);

        for (const m of pbMembers) {
            // Match by Name
            let roleId = nameMap[m.name];

            if (!roleId) {
                // Try reverse name check just in case (e.g. "Auschew Dietrich" vs "Dietrich Auschew")
                // but usually CT and PB should match as PB was synced from CT.
                // console.log(`Could not find CT member for ${m.name}`);
                continue;
            }

            let gridRole = 'Teilnehmer';
            if (roleId === 9) gridRole = 'Leiter';
            else if (roleId === 8) gridRole = 'Teilnehmer';
            else if (roleId === 42) gridRole = 'Teilnehmer 2';

            if (m.role !== gridRole) {
                console.log(`Updating ${m.name}: ${m.role} -> ${gridRole}`);
                await pb.collection('members').update(m.id, { role: gridRole });
            }
        }
        console.log('Manual Sync Fix Completed.');

    } catch (e) {
        console.error('Error during sync fix:', e);
    }
}

fixRoles();
