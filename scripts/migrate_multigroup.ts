
import PocketBase from 'pocketbase';
import 'dotenv/config';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
let PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (PB_ADMIN_PASSWORD && PB_ADMIN_PASSWORD.startsWith("'") && PB_ADMIN_PASSWORD.endsWith("'")) {
    PB_ADMIN_PASSWORD = PB_ADMIN_PASSWORD.slice(1, -1);
}

async function migrate() {
    console.log(`Connecting to ${PB_URL}...`);
    const pb = new PocketBase(PB_URL);

    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);
        console.log('Authenticated as Admin.');
    } catch (e: any) {
        console.error('Auth failed:', e.message);
        process.exit(1);
    }

    // 1. Create 'groups' collection
    try {
        await pb.collections.create({
            name: 'groups',
            type: 'base',
            schema: [
                { name: 'name', type: 'text', required: true },
                { name: 'ct_id', type: 'text', required: true }, // ChurchTools Group ID
                { name: 'color', type: 'text' }
            ]
        });
        console.log("✅ Created 'groups' collection.");
    } catch (e: any) {
        if (e.status === 400) {
            console.log("ℹ️ 'groups' collection likely already exists.");
        } else {
            console.error("❌ Failed to create 'groups':", e.message);
        }
    }

    // 2. Add 'groups' relation to 'users'
    try {
        const usersCol = await pb.collections.getOne('users');
        if (!usersCol.schema) usersCol.schema = [];

        const hasGroups = usersCol.schema.find((f: any) => f.name === 'groups');

        if (!hasGroups) {
            usersCol.schema.push({
                name: 'groups',
                type: 'relation',
                required: false,
                options: {
                    collectionId: (await pb.collections.getOne('groups')).id,
                    cascadeDelete: false,
                    maxSelect: null, // Multiple
                    displayFields: []
                }
            });
            await pb.collections.update('users', usersCol);
            console.log("✅ Added 'groups' relation to 'users'.");
        } else {
            console.log("ℹ️ 'users' already has 'groups' relation.");
        }
    } catch (e: any) {
        console.error("❌ Failed to update 'users':", e.message);
    }

    // 3. Add 'group' relation to 'meetings'
    try {
        const meetingsCol = await pb.collections.getOne('meetings');
        if (!meetingsCol.schema) meetingsCol.schema = [];

        const hasGroup = meetingsCol.schema.find((f: any) => f.name === 'group');

        if (!hasGroup) {
            meetingsCol.schema.push({
                name: 'group',
                type: 'relation',
                required: false, // Optional for legacy meetings
                options: {
                    collectionId: (await pb.collections.getOne('groups')).id,
                    cascadeDelete: false,
                    maxSelect: 1, // Single
                    displayFields: []
                }
            });
            await pb.collections.update('meetings', meetingsCol);
            console.log("✅ Added 'group' relation to 'meetings'.");
        } else {
            console.log("ℹ️ 'meetings' already has 'group' relation.");
        }
    } catch (e: any) {
        console.error("❌ Failed to update 'meetings':", e.message);
    }

    // 4. Add 'group' relation to 'members'
    try {
        const membersCol = await pb.collections.getOne('members');
        if (!membersCol.schema) membersCol.schema = [];

        const hasGroup = membersCol.schema.find((f: any) => f.name === 'group');

        if (!hasGroup) {
            membersCol.schema.push({
                name: 'group',
                type: 'relation',
                required: false,
                options: {
                    collectionId: (await pb.collections.getOne('groups')).id,
                    cascadeDelete: false,
                    maxSelect: 1, // Single
                    displayFields: []
                }
            });
            await pb.collections.update('members', membersCol);
            console.log("✅ Added 'group' relation to 'members'.");
        } else {
            console.log("ℹ️ 'members' already has 'group' relation.");
        }
    } catch (e: any) {
        console.error("❌ Failed to update 'members':", e.message);
    }
}

migrate();
