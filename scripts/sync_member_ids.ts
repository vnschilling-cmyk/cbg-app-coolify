
import PocketBase from 'pocketbase';
import { ChurchToolsClient } from '../src/lib/server/churchtools';
import 'dotenv/config';

const PB_URL = process.env.PUBLIC_POCKETBASE_URL;
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
const CT_BASE_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function syncIds() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);
    const ctClient = new ChurchToolsClient(CT_BASE_URL!, CT_TOKEN!);

    const groups = await pb.collection('groups').getFullList();
    for (const group of groups) {
        console.log(`Processing group ${group.name}...`);
        const members = await ctClient.getGroupMembers(group.ct_id);

        for (const m of members) {
            const person = m.person || m;
            const name = `${person.firstName} ${person.lastName}`;
            const ctId = String(m.personId);

            try {
                // Find member in PB by name and group
                const existing = await pb.collection('members').getFirstListItem(`name~"${person.firstName}" && name~"${person.lastName}" && group="${group.id}"`);
                if (!existing.ct_id) {
                    await pb.collection('members').update(existing.id, { ct_id: ctId });
                    console.log(`Updated ${name} with CT ID ${ctId}`);
                }
            } catch (e) {
                // Not found or ambiguous
            }
        }
    }
    console.log('Sync complete.');
}

syncIds().catch(console.error);
