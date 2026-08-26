
const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ? process.env.PB_ADMIN_PASSWORD.replace(/^'|'$/g, '') : '';
const GROUP_ID = '164';

async function fixNames() {
    console.log('Starting Manual Name Fix...');
    const pb = new PocketBase(PB_URL);

    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

        // Fetch CT Members
        console.log('Fetching CT members...');
        const ctRes = await fetch(`${CT_URL}/api/groups/${GROUP_ID}/members?limit=100`, {
            headers: { Authorization: `Login ${CT_TOKEN}` }
        });
        const ctData = await ctRes.json();
        const ctMembers = ctData.data;

        // Fetch PB Group
        const pbGroup = await pb.collection('groups').getFirstListItem(`ct_id="${GROUP_ID}"`);

        // Count name occurrences in CT
        const nameCounts = {};
        ctMembers.forEach(m => {
            const name = `${m.person?.domainAttributes?.firstName} ${m.person?.domainAttributes?.lastName}`.trim();
            nameCounts[name] = (nameCounts[name] || 0) + 1;
        });

        // Sync logic
        for (const m of ctMembers) {
            let firstName = m.person?.domainAttributes?.firstName;
            let lastName = m.person?.domainAttributes?.lastName;
            let name = `${firstName} ${lastName}`.trim();

            // If duplicate name in CT, append ID
            if (nameCounts[name] > 1) {
                name = `${name} (${m.personId})`;
                console.log(`Duplicate found: Renaming to "${name}"`);
            }

            let roleId = m.groupTypeRoleId;
            let gridRole = 'Teilnehmer';
            if (roleId === 9) gridRole = 'Leiter';
            else if (roleId === 8) gridRole = 'Teilnehmer';
            else if (roleId === 42) gridRole = 'Teilnehmer 2';

            // Try to find in PB
            try {
                // We try to find by name first. 
                // IF we already have "Viktor Enns", we update it to "Viktor Enns (ID)" if needed?
                // Actually, if we have duplicate names in CT, we likely have only ONE in PB right now.
                // So we need to create the second one.

                // Strategy: Find by name. If found, check if we need to rename it or create new.
                // Since we don't store CT ID in members (yet), we rely on name.

                // If we are renaming "Viktor Enns" to "Viktor Enns (613)", we might find "Viktor Enns".
                // We should update it.
                // Then for "Viktor Enns (19)", we won't find it, so we create it.

                // BUT: We don't know WHICH "Viktor Enns" in PB corresponds to which CT ID.
                // Ideally we delete the old "Viktor Enns" and re-create both to be safe, 
                // OR we update the existing one to one of them and create the other.

                // Let's just try to create/update based on the NEW unique name.

                try {
                    const existing = await pb.collection('members').getFirstListItem(`name="${name}" && group="${pbGroup.id}"`);
                    if (existing.role !== gridRole) {
                        console.log(`Updating role for ${name}: ${existing.role} -> ${gridRole}`);
                        await pb.collection('members').update(existing.id, { role: gridRole });
                    }
                } catch (e) {
                    if (e.status === 404) {
                        console.log(`Creating missing member: ${name}`);
                        await pb.collection('members').create({
                            name: name,
                            group: pbGroup.id,
                            role: gridRole,
                            allowed_services: []
                        });
                    }
                }

            } catch (err) {
                console.error(err);
            }
        }

        // Cleanup: If we have "Viktor Enns" (generic) but now use specific names, we should check if
        // the generic one is still needed. 
        // If we created "Viktor Enns (613)" and "Viktor Enns (19)", and "Viktor Enns" still exists, delete it.
        // Or if we updated "Viktor Enns" to "Viktor Enns (613)", then "Viktor Enns" is gone.
        // Wait, "update" only works if we query by the NEW name, which won't exist yet.

        // Correction: Query for the OLD name "Viktor Enns". If found, rename it to the first match?
        // This script above queries by the NEW name. So it will create 2 new records if neither exists.
        // And "Viktor Enns" will remain.

        // Let's clean up "Viktor Enns" if it exists and we have duplicates.
        try {
            const oldGeneric = await pb.collection('members').getFirstListItem(`name="Viktor Enns" && group="${pbGroup.id}"`);
            if (oldGeneric) {
                console.log('Deleting generic "Viktor Enns" to avoid duplicates...');
                await pb.collection('members').delete(oldGeneric.id);
            }
        } catch (e) {
            // Ignore if not found
        }

        console.log('Manual Name Fix Completed.');

    } catch (e) {
        console.error('Error:', e);
    }
}

fixNames();
