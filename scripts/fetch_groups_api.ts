import dotenv from 'dotenv';
dotenv.config();

const CT_URL = process.env.CHURCHTOOLS_BASE_URL;
const CT_TOKEN = process.env.CHURCHTOOLS_TOKEN;

async function fetchGroupsFromAPI() {
    console.log(`Fetching groups from ${CT_URL}...`);

    try {
        const res = await fetch(`${CT_URL}/api/groups?limit=200`, {
            headers: { Authorization: `Login ${CT_TOKEN}` }
        });

        if (!res.ok) {
            console.error(`Status: ${res.status} ${res.statusText}`);
            return;
        }

        const json = await res.json();
        console.log('Groups:');
        json.data.forEach((g: any) => {
            console.log(`- ${g.name} (id: ${g.id})`);
        });
    } catch (e: any) {
        console.error('ERROR:', e.message);
    }
}

fetchGroupsFromAPI();
