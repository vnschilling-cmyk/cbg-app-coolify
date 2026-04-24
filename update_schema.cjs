const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function updateSchema() {
    const email = process.env.PB_ADMIN_EMAIL;
    const password = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Authenticated as admin.');

        // 1. Update 'meetings' collection
        const meetingsCollection = await pb.collections.getOne('meetings');
        let mFields = meetingsCollection.fields || meetingsCollection.schema || [];

        const roles = [
            { name: 'moderator', label: 'Moderator' },
            { name: 'intro_bible_word', label: 'Einleitungsbibelwort' },
            { name: 'closing_bible_word', label: 'Abschlussgebet/wort' }
        ];

        let meetingsUpdated = false;
        for (const role of roles) {
            if (!mFields.find(f => f.name === role.name)) {
                console.log(`Adding ${role.name} to meetings...`);
                mFields.push({
                    name: role.name,
                    type: 'relation',
                    collectionId: 'pbc_3572739349', // members collection ID
                    cascadeDelete: false,
                    maxSelect: 1
                });
                meetingsUpdated = true;
            }
        }

        if (meetingsUpdated) {
            await pb.collections.update('meetings', { fields: mFields });
            console.log('Meetings schema updated.');
        } else {
            console.log('Meetings schema already up to date.');
        }

        // 2. Update 'protocol_items' collection
        const protocolCollection = await pb.collections.getOne('protocol_items');
        let pFields = protocolCollection.fields || protocolCollection.schema || [];
        const typeField = pFields.find(f => f.name === 'type');

        if (typeField && typeField.type === 'select') {
            if (!typeField.values.includes('prayer')) {
                console.log('Adding "prayer" type to protocol_items...');
                typeField.values.push('prayer');
                await pb.collections.update('protocol_items', { fields: pFields });
                console.log('Protocol items schema updated.');
            } else {
                console.log('Protocol items schema already has "prayer" type.');
            }
        } else if (typeField && typeField.type === 'text') {
            // In case type is just text, do nothing
            console.log('Type is text, skipping prayer value addition.');
        }

    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) console.error('Response:', JSON.stringify(err.response, null, 2));
    }
}

updateSchema();
