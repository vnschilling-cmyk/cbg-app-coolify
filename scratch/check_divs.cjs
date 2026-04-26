
const fs = require('fs');
const content = fs.readFileSync('src/lib/components/GridEditor.svelte', 'utf8');

let stack = [];
let lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let divRegex = /<(div)|<\/div>/g;
    let match;
    while ((match = divRegex.exec(line)) !== null) {
        if (match[0] === '<div') {
            stack.push(i + 1);
        } else if (match[0] === '</div>') {
            if (stack.length === 0) {
                console.log(`Extra closing div at line ${i + 1}`);
            } else {
                stack.pop();
            }
        }
    }
}

if (stack.length > 0) {
    console.log(`Unclosed div(s) starting at line(s): ${stack.join(', ')}`);
} else {
    console.log("Balanced!");
}
