
const dotenv = require('dotenv');

dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function inspectAbsences() {
    try {
        const fromDate = '2026-03-01';
        const toDate = '2026-04-30';
        const groupId = '164';

        console.log(`Fetching absences for group ${groupId} from ${fromDate} to ${toDate}...`);

        const response = await fetch(`${CT_URL}/api/groups/${groupId}/absences?from=${fromDate}&to=${toDate}&limit=100`, {
            headers: { 'Authorization': `Login ${CT_TOKEN}` }
        });
        const data = await response.json();

        console.log('Absences response:');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }
}

inspectAbsences();
