
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import PocketBase from 'pocketbase';
import dotenv from 'dotenv';

dotenv.config();

const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
// You might need PB admin credentials in .env for this script to work fully automatically
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

const GROUP_ID = '31'; // Bruderrat

async function syncGroup31() {
    if (!CT_BASE_URL || !CT_TOKEN) {
        console.error('Missing ChurchTools config in .env');
        return;
    }

    console.log(`Connecting to ChurchTools at ${CT_BASE_URL}...`);
    const ctClient = new ChurchToolsClient(CT_BASE_URL, CT_TOKEN);

    console.log(`Connecting to PocketBase at ${PB_URL}...`);
    const pb = new PocketBase(PB_URL);

    // Optional: Authenticate as Admin if variables are present
    if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
        try {
            console.log(`Authenticating as Admin: ${PB_ADMIN_EMAIL}`);
            await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
            console.log('Authenticated as PB Admin.');
        } catch (e: any) {
            console.error('Failed to auth as PB Admin (superuser):', e.message);
            // Try as regular user in 'users' collection
            try {
                console.log('Trying auth via "users" collection...');
                await pb.collection('users').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
                console.log('Authenticated as User Admin.');
            } catch (userAuthError: any) {
                console.error('Failed to auth as User Admin:', userAuthError.message);
            }
        }
    }

    try {
        console.log(`Fetching members for Group ID ${GROUP_ID}...`);
        const members = await ctClient.getGroupMembers(GROUP_ID);
        console.log(`Found ${members.length} members.`);

        if (members.length > 0) {
            // console.log('Sample Member:', JSON.stringify(members[0], null, 2));
        }

        for (const member of members) {
            // Inspect member object for role
            // CT structure usually: { person: {...}, groupTypeRoleId: number, ... }
            // or sometimes directly fields. We need to check structure.
            // For now, let's assume we can find email and name.

            let person = member.person || member;
            let email = person.email;

            // If email is missing, fetch full person details
            if (!email && member.personId) {
                try {
                    console.log(`fetching person ${member.personId}...`);
                    const personData = await ctClient.request(`persons/${member.personId}`);
                    // API returns { data: { ... } } or just the object depending on endpoint?
                    // Usually CT API returns wrapped data. Let's check 'data' property.
                    person = personData.data || personData;
                    email = person.email;
                } catch (e) {
                    console.error(`Failed to fetch person ${member.personId}:`, e);
                }
            }

            const firstName = person.firstName;
            const lastName = person.lastName;


            // Role mapping logic
            // groupTypeRoleId 16 = Leiter -> admin
            // groupTypeRoleId 17 = Co-Leiter -> admin
            // groupTypeRoleId 15 = Mitarbeiter -> user

            const roleId = member.groupTypeRoleId;
            let appRole = 'user';

            if (roleId === 16 || roleId === 17) {
                appRole = 'admin';
            } else if (roleId === 15) {
                appRole = 'user';
            } else {
                // Default fallback
                console.log(`Unknown groupTypeRoleId ${roleId} for ${firstName} ${lastName}, defaulting to user.`);
                appRole = 'user';
            }

            if (!email) {
                console.warn(`Skipping ${firstName} ${lastName}: No email.`);
                continue;
            }

            console.log(`Processing ${firstName} ${lastName} (${email}) - Role ID: ${roleId} -> ${appRole}`);

            // Check if user exists in PB
            try {
                const existingUser = await pb.collection('users').getFirstListItem(`email="${email}"`);
                console.log(`  User exists (ID: ${existingUser.id}). Updating...`);

                await pb.collection('users').update(existingUser.id, {
                    name: `${firstName} ${lastName}`,
                    role: appRole,
                    // Don't overwrite other fields potentially
                });
            } catch (e: any) {
                if (e.status === 404) {
                    console.log(`  User does not exist. Creating...`);
                    // Create new user with robust password
                    const tempPassword = `Pwd${Math.random().toString(36).slice(-8)}${Math.random().toString(36).slice(-8)}!`;

                    try {
                        await pb.collection('users').create({
                            email: email,
                            emailVisibility: true,
                            password: tempPassword,
                            passwordConfirm: tempPassword,
                            name: `${firstName} ${lastName}`,
                            role: appRole,
                        });
                        console.log(`  Created user: ${firstName} ${lastName} (${appRole})`);
                    } catch (createError: any) {
                        console.error(`  Failed to create user ${email}:`, createError?.data || createError.message);
                    }
                } else {
                    console.error(`  Error checking user:`, e);
                }
            }
        }
        console.log('Sync complete.');

    } catch (e) {
        console.error('Error during sync:', e);
    }
}

syncGroup31();
