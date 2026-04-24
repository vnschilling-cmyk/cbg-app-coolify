import dotenv from 'dotenv';
dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;
const GROUP_ID = '164';

async function testPreachers() {
    console.log(`Fetching preachers from ${CT_URL} for Group ${GROUP_ID}...`);

    try {
        const url = `${CT_URL}/api/groups/${GROUP_ID}/members?limit=100`;
        const res = await fetch(url, {
            headers: { Authorization: `Login ${CT_TOKEN}` }
        });

        const json = await res.json();
        if (json.data && json.data.length > 0) {
            console.log('Sample raw member:', JSON.stringify(json.data[0], null, 2));
            console.log(`Found ${json.data.length} members.`);
            json.data.forEach((m: any) => {
                console.log(`- Member: ${m.person?.title || m.personId}, personId: ${m.personId}`);
            });
        }
    } catch (e: any) {
        console.error('ERROR:', e.message);
    }
}

testPreachers();
