import dotenv from 'dotenv';
dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const GROUP_ID = '164';

async function testAbsences() {
    const from = '2026-03-01';
    const to = '2026-04-30';

    console.log(`Testing absences from ${CT_URL} for Group ${GROUP_ID}...`);

    try {
        const url = `${CT_URL}/api/groups/${GROUP_ID}/absences?from=${from}&to=${to}&limit=100`;
        console.log(`Fetch: ${url}`);

        const res = await fetch(url, {
            headers: { Authorization: `Login ${CT_TOKEN}` }
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        const json = await res.json();

        if (json.data && json.data.length > 0) {
            console.log('Sample raw absence:', JSON.stringify(json.data[0], null, 2));
            console.log(`Found ${json.data.length} absences.`);
            json.data.forEach((a: any) => {
                console.log(`- Person ${a.personId}: ${a.startDate} to ${a.endDate} (${a.absenceReason?.nameTranslated})`);
            });
        } else {
            console.log('No data field in response:', json);
        }
    } catch (e: any) {
        console.error('ERROR:', e.message);
    }
}

testAbsences();
