const dotenv = require('dotenv');
const PocketBase = require('pocketbase/cjs');

dotenv.config();

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

async function check() {
    const email = process.env.PB_ADMIN_EMAIL;
    const password = process.env.PB_ADMIN_PASSWORD.replace(/'/g, '');

    try {
        await pb.admins.authWithPassword(email, password);
        console.log('Authenticated as admin.');

        const groups = await pb.collection('groups').getFullList();
        const preacherGroup = groups.find(g => g.ct_id === '164');
        const bruderratGroup = groups.find(g => g.ct_id === '31');

        if (!preacherGroup || !bruderratGroup) {
            console.error('Groups not found.');
            return;
        }

        console.log(`Preacher ID: ${preacherGroup.id}, Bruderrat ID: ${bruderratGroup.id}`);

        const preachers = await pb.collection('members').getFullList({ filter: `group="${preacherGroup.id}"` });
        const bruderrat = await pb.collection('members').getFullList({ filter: `group="${bruderratGroup.id}"` });

        const preacherNames = new Set(preachers.map(p => p.name));
        const bruderratNames = new Set(bruderrat.map(b => b.name));

        console.log(`\nPreachers Count: ${preachers.length}`);
        console.log(`Bruderrat Count: ${bruderrat.length}`);

        console.log('\nPeople in BOTH:');
        const intersection = [...bruderratNames].filter(name => preacherNames.has(name));
        intersection.forEach(name => console.log(`- ${name}`));

        console.log('\nPeople ONLY in Bruderrat:');
        const onlyBruderrat = [...bruderratNames].filter(name => !preacherNames.has(name));
        onlyBruderrat.forEach(name => console.log(`- ${name}`));

        console.log('\nPeople ONLY in Preachers:');
        const onlyPreachers = [...preacherNames].filter(name => !bruderratNames.has(name));
        onlyPreachers.forEach(name => console.log(`- ${name}`));

        console.log('\nViktor Schilling search:');
        const viktorInMembers = await pb.collection('members').getFullList({ filter: 'name ~ "Viktor Schilling"' });
        viktorInMembers.forEach(m => console.log(`- ${m.name} (ID: ${m.id}, Group: ${m.group})`));

    } catch (err) {
        console.error('Error:', err.message);
    }
}

check();
