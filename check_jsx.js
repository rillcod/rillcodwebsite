import fs from 'fs';

const content = fs.readFileSync('src/app/dashboard/curriculum/page.tsx', 'utf8');
const lines = content.split('\n');

let stack = [];
let tags = [];

const regex = /<(\/)?([a-zA-Z0-9\.]+)/g;

lines.forEach((line, i) => {
    let match;
    while ((match = regex.exec(line)) !== null) {
        const isClosing = !!match[1];
        const tagName = match[2];
        const lineNum = i + 1;

        if (tagName === 'img' || tagName === 'br' || tagName === 'hr' || tagName === 'input' || tagName === 'link' || tagName === 'meta') continue;
        
        // Check for self-closing in the same line
        const fullTag = line.substring(match.index);
        const closingIndex = fullTag.indexOf('>');
        if (closingIndex !== -1 && fullTag.substring(0, closingIndex).endsWith('/')) {
            continue;
        }

        if (isClosing) {
            if (stack.length === 0) {
                console.log(`Extra closing tag </${tagName}> at line ${lineNum}`);
            } else {
                const last = stack.pop();
                if (last.name !== tagName) {
                    console.log(`Mismatched closing tag </${tagName}> at line ${lineNum} (expected </${last.name}> from line ${last.line})`);
                }
            }
        } else {
            stack.push({ name: tagName, line: lineNum });
        }
    }
});

console.log('Unclosed tags:', stack);
