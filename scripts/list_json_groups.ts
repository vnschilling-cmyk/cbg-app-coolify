import fs from 'fs';

try {
    const data = JSON.parse(fs.readFileSync('groups_response.json', 'utf8'));
    console.log('Groups from groups_response.json:');
    data.data.forEach((g: any) => {
        console.log(`- ${g.name} (id: ${g.id})`);
    });
} catch (e: any) {
    console.error('Error reading groups_response.json:', e.message);
}
