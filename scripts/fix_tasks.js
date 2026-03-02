const fs = require('fs');

const path = 'lms-system-completion/tasks.md';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (i >= 1217) { // Phase 11 starts around line 1218 (0-indexed 1217)
        lines[i] = lines[i].replace(/\[x\]/g, '[ ]');
    }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Fixed tasks.md checkboxes for Phase 11 onwards');
