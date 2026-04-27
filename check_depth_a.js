import fs from 'fs';

const content = fs.readFileSync('src/app/dashboard/curriculum/page.tsx', 'utf8');
const lines = content.split('\n');

let depth = 0;
let inRange = false;

lines.forEach((line, i) => {
    const lineNum = i + 1;
    if (lineNum === 2026) inRange = true;
    if (lineNum === 2215) inRange = false;
    
    if (!inRange) return;

    const openings = (line.match(/<div(?! [^>]*\/>)/g) || []).length;
    const closings = (line.match(/<\/div>/g) || []).length;
    
    depth += openings - closings;
    
    if (openings > 0 || closings > 0) {
        console.log(`${lineNum}: Depth: ${depth} ( +${openings}, -${closings} ) | ${line.trim()}`);
    }
});
