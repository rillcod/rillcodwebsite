const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/app/dashboard/playground/page.tsx');
let f = fs.readFileSync(file, 'utf8');

const replacements = [
  // Console area background
  ["bg-[#020617] relative", "bg-background relative"],
  // Console header bar
  ["bg-black/20 shrink-0", "bg-muted/20 shrink-0"],
  // Console output area
  ["custom-scrollbar bg-black/40 font-mono", "custom-scrollbar bg-background/60 font-mono"],
  // Console log text (non-error)
  ["text-emerald-50/90", "text-foreground/90"],
  // UI builder sidebar panel
  ["bg-[#0d1526]/40 p-3 overflow-y-auto", "bg-card/40 p-3 overflow-y-auto"],
];

let count = 0;
for (const [from, to] of replacements) {
  if (f.includes(from)) {
    f = f.split(from).join(to);
    console.log(`✓ Replaced: "${from}"`);
    count++;
  } else {
    console.log(`⚠ Not found: "${from}"`);
  }
}

fs.writeFileSync(file, f, 'utf8');
console.log(`\nDone — ${count}/${replacements.length} replacements applied.`);
