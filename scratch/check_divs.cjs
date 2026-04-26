const fs = require('fs');
const content = fs.readFileSync('src/lib/components/GridEditor.svelte', 'utf8');

let stack = [];
let i = 0;
while (i < content.length) {
    if (content.startsWith('<div', i)) {
        let end = content.indexOf('>', i);
        let line = content.substring(0, i).split('\n').length;
        stack.push({ line, tag: content.substring(i, end + 1) });
        i = end + 1;
    } else if (content.startsWith('</div', i)) {
        let end = content.indexOf('>', i);
        let line = content.substring(0, i).split('\n').length;
        if (stack.length === 0) {
            console.log(`Extra closing tag at line ${line}`);
        } else {
            let open = stack.pop();
            if (line > 1490 && line < 1530) {
                console.log(`Tag at line ${line} closed opening from line ${open.line}`);
            }
        }
        i = end + 1;
    } else {
        i++;
    }
}
