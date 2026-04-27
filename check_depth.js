import fs from 'fs';

const content = fs.readFileSync('src/app/dashboard/curriculum/page.tsx', 'utf8');
const lines = content.slice(content.indexOf('/* Curriculum content */')).split('\n').slice(0, 400); // Branch E area

let depth = 0;
lines.forEach((line, i) => {
    const openings = (line.match(/<div(?! [^>]*\/>)/g) || []).length;
    const closings = (line.match(/<\/div>/g) || []).length;
    const selfClosings = (line.match(/<div [^>]*\/>/g) || []).length;
    
    depth += openings - closings;
    
    if (openings > 0 || closings > 0) {
        console.log(`${i + 2346}: Depth: ${depth} ( +${openings}, -${closings} ) | ${line.trim()}`);
    }
});
