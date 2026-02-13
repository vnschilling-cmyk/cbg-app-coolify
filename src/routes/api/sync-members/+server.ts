
import { json } from '@sveltejs/kit';
import { ChurchToolsClient } from '$lib/server/churchtools';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

// ENV variables should be loaded from $env/dynamic/private or process.env depending on setup
// utilizing env from $env/dynamic/private for runtime env vars
const CT_BASE_URL = env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = env.CHURCHTOOLS_TOKEN;
const PB_URL = PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = env.PB_ADMIN_EMAIL;
let PB_ADMIN_PASSWORD = env.PB_ADMIN_PASSWORD;

// Remove surrounding quotes if they exist (common issue with some env parsers)
if (PB_ADMIN_PASSWORD && PB_ADMIN_PASSWORD.startsWith("'") && PB_ADMIN_PASSWORD.endsWith("'")) {
    PB_ADMIN_PASSWORD = PB_ADMIN_PASSWORD.slice(1, -1);
}



export async function POST({ locals }) {
    // Optional: Check if user is admin
    if (!locals.user) {
        return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // If strict admin check is needed:
    // if (locals.user.role !== 'admin') { return json({ ... }, { status: 403 }); }

    if (!CT_BASE_URL || !CT_TOKEN) {
        return json({ success: false, message: 'Missing ChurchTools configuration' }, { status: 500 });
    }

    const logs: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        logs.push(msg);
    };

    try {
        log('Starting sync...');

        const ctClient = new ChurchToolsClient(CT_BASE_URL, CT_TOKEN);
        const pb = new PocketBase(PB_URL);

        // Authenticate as Admin
        if (PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD) {
            try {
                await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
                log('Authenticated as PB Admin.');
            } catch (e: any) {
                log(`Failed to auth as PB Admin: ${e.message}`);
                const details = e.response ? JSON.stringify(e.response) : e.message;
                return json({ success: false, message: `PB Admin Auth failed: ${details}`, logs }, { status: 500 });
            }
        } else {
            log('Missing PB_ADMIN credentials.');
            return json({ success: false, message: 'Missing PocketBase Admin credentials', logs }, { status: 500 });
        }

        // Fetch all configured groups
        const groups = await pb.collection('groups').getFullList();

        // Check if Prediger (164) is missing and add it if so
        const PREACHER_CT_ID = '164';
        const hasPreacherGroup = groups.some(g => g.ct_id === PREACHER_CT_ID);

        if (!hasPreacherGroup) {
            log('Prediger group (ID 164) not found in PocketBase. Adding it...');
            try {
                const newGroup = await pb.collection('groups').create({
                    name: 'Prediger',
                    ct_id: PREACHER_CT_ID
                });
                groups.push(newGroup);
                log('Added Prediger group.');
            } catch (err: any) {
                log(`Failed to auto-create Prediger group: ${err.message}`);
            }
        }

        log(`Found ${groups.length} configured groups to sync.`);

        let updated = 0;
        let created = 0;

        for (const group of groups) {
            log(`Syncing group '${group.name}' (ID: ${group.ct_id})...`);
            try {
                const members = await ctClient.getGroupMembers(group.ct_id);
                log(`Found ${members.length} members in Group ${group.name}.`);

                for (const member of members) {
                    let person = member.person || member;
                    let email = person.email;

                    // Fetch details if email missing
                    if (!email && member.personId) {
                        try {
                            const personData = await ctClient.request(`persons/${member.personId}`);
                            person = personData.data || personData;
                            email = person.email;
                        } catch (e) {
                            log(`Failed to fetch details for person ${member.personId}`);
                        }
                    }

                    const firstName = person.firstName;
                    const lastName = person.lastName;
                    const roleId = member.groupTypeRoleId;
                    let appRole = 'user';

                    // Mapping for ChurchTools Group Type 1 (Kleingruppe)
                    // 9: Leiter, 8: Teilnehmer, 42: Teilnehmer 2
                    if (roleId === 9) {
                        appRole = 'admin';
                    } else {
                        appRole = 'user';
                    }

                    // Map to readable roles for the grid view (members collection)
                    let gridRole = 'Teilnehmer';
                    if (roleId === 9) {
                        gridRole = 'Leiter';
                    } else if (roleId === 8) {
                        gridRole = 'Teilnehmer';
                    } else if (roleId === 42) {
                        gridRole = 'Teilnehmer 2';
                    } else {
                        // Fallback for other roles/groups
                        gridRole = appRole === 'admin' ? 'Leiter' : 'Teilnehmer';
                    }

                    if (!email) {
                        log(`Skipping ${firstName || ''} ${lastName || ''} (ID: ${member.personId}): No email.`);
                        continue;
                    }

                    log(`Processing ${firstName} ${lastName} (${email})...`);

                    // 1. Sync User (Login)
                    try {
                        const existingUser = await pb.collection('users').getFirstListItem(`email="${email}"`);

                        // Update basic info and role
                        const updateData: any = {
                            name: `${firstName} ${lastName}`,
                            role: appRole,
                        };

                        // Add to group relation if not present
                        if (!existingUser.groups?.includes(group.id)) {
                            updateData['groups+'] = group.id;
                        }

                        await pb.collection('users').update(existingUser.id, updateData);
                        updated++;
                    } catch (e: any) {
                        if (e.status === 404) {
                            const tempPassword = `Pwd${Math.random().toString(36).slice(-8)}${Math.random().toString(36).slice(-8)}!`;
                            try {
                                await pb.collection('users').create({
                                    email: email,
                                    emailVisibility: true,
                                    password: tempPassword,
                                    passwordConfirm: tempPassword,
                                    name: `${firstName} ${lastName}`,
                                    role: appRole,
                                    groups: [group.id]
                                });
                                created++;
                                log(`Created user: ${firstName} ${lastName}`);
                            } catch (err: any) {
                                log(`Failed to create ${email}: ${err.message}`);
                            }
                        } else {
                            log(`Error checking user ${email}: ${e.message}`);
                        }
                    }

                    // 2. Sync 'members' collection (Meeting View)
                    try {
                        let memberName = `${firstName} ${lastName}`;

                        // DUPLICATE CHECK:
                        // If we have multiple members with the same name in the source list (e.g. Viktor Enns),
                        // we need to distinguish them. We can use the personId.
                        // Check if this name appears multiple times in our source list 'members'
                        const isDuplicateName = members.filter(m => {
                            const p = m.person || m;
                            return `${p.firstName} ${p.lastName}` === memberName;
                        }).length > 1;

                        if (isDuplicateName) {
                            if (member.personId == 19) {
                                memberName = `${memberName} (Jun.)`;
                            } else if (member.personId == 613) {
                                memberName = `${memberName} (Sen.)`;
                            } else {
                                memberName = `${memberName} (${member.personId})`;
                            }
                        }

                        // Try to find existing member by name AND group
                        try {
                            // Note: 'members' collection logic might need adjustment if names collide across groups, 
                            // but filtering by group is safer.
                            // Currently assume one member entry per group per person.
                            const existingMember = await pb.collection('members').getFirstListItem(`name="${memberName}" && group="${group.id}"`);

                            const updateData: any = {};
                            if (existingMember.role !== gridRole) {
                                updateData.role = gridRole;
                            }
                            if (!existingMember.ct_id) {
                                updateData.ct_id = String(member.personId);
                            }

                            if (Object.keys(updateData).length > 0) {
                                await pb.collection('members').update(existingMember.id, updateData);
                                log(` Updated member info for: ${memberName}`);
                            }
                        } catch (e: any) {
                            // Not found, create
                            if (e.status === 404) {
                                await pb.collection('members').create({
                                    name: memberName,
                                    role: gridRole,
                                    group: group.id,
                                    ct_id: String(member.personId),
                                    allowed_services: [] // Initialize empty
                                });
                                log(` Created member in ${group.name}: ${memberName} (${gridRole})`);
                            } else {
                                throw e;
                            }
                        }
                    } catch (e: any) {
                        log(`Failed to sync member ${firstName} ${lastName} to group ${group.name}: ${e.message}`);
                    }
                }
            } catch (groupError: any) {
                log(`Failed to process group ${group.name}: ${groupError.message}`);
            }
        }


        return json({
            success: true,
            message: `Sync complete. Updated: ${updated}, Created: ${created}`,
            logs
        });

    } catch (e: any) {
        console.error(e);
        return json({ success: false, message: e.message, logs }, { status: 500 });
    }
}
