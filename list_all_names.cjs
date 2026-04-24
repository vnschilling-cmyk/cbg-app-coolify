
const fs = require('fs');
const data = fs.readFileSync('groups_utf8.json', 'utf8');
const json = JSON.parse(data);
const groups = json.data || [];
console.log('--- CHURCHTOOLS GROUPS ---');
groups.forEach((g) => {
    console.log(`ID: ${g.id} | Name: ${g.name}`);
});
