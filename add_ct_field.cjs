const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function addCTField() {
    const email = process.env.PB_ADMIN_EMAIL;
    const password = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Authenticated as admin.');

        const meetingsCollection = await pb.collections.getOne('meetings');
        let fields = meetingsCollection.schema || [];

        if (!fields.find(f => f.name === 'ct_event_id')) {
            console.log('Adding ct_event_id to meetings...');
            fields.push({
                name: 'ct_event_id',
                type: 'text',
                options: {
                    min: null,
                    max: null,
                    pattern: ''
                }
            });
            await pb.collections.update('meetings', { schema: fields });
            console.log('Meetings schema updated with ct_event_id.');
        } else {
            console.log('ct_event_id already exists.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

addCTField();
