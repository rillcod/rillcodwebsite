/**
 * Bulk Glass UI Upgrade Script — Public Pages
 * 
 * Transforms legacy public page containers to the glass design system.
 * Also fixes mobile padding (px-6 → px-3.5 sm:px-8).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(process.cwd(), 'src');

const REPLACEMENTS = [
  // Public page outer container padding
  [
    /max-w-screen-2xl mx-auto px-6 lg:px-20/g,
    'max-w-screen-2xl mx-auto px-3.5 sm:px-8 lg:px-20'
  ],

  // Card containers — same patterns as dashboard
  [
    /bg-card border border-border rounded-2xl p-5 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-2xl p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-2xl p-5(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-xl p-5 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-xl p-5(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-xl p-4(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  [
    /bg-card border border-border rounded-xl p-4 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
];

function walk(dir, ext = '.tsx') {
  let results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        // Skip dashboard (already done) and api routes
        if (entry === 'dashboard' || entry === 'api') continue;
        results = results.concat(walk(full, ext));
      } else if (full.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

let totalFiles = 0;
let modifiedFiles = 0;
let totalReplacements = 0;

const targets = [
  ...walk(join(ROOT, 'app'), '.tsx'),
  ...walk(join(ROOT, 'components', 'landing'), '.tsx'),
  ...walk(join(ROOT, 'components', 'auth'), '.tsx'),
  ...walk(join(ROOT, 'components', 'special-programs'), '.tsx'),
  ...walk(join(ROOT, 'components', 'result-check'), '.tsx'),
  ...walk(join(ROOT, 'features', 'registration'), '.tsx'),
];

for (const filePath of targets) {
  const original = readFileSync(filePath, 'utf8');
  let content = original;
  let fileReplacements = 0;

  for (const [pattern, replacement] of REPLACEMENTS) {
    const matches = content.match(pattern);
    if (matches) fileReplacements += matches.length;
    content = content.replace(pattern, replacement);
  }

  totalFiles++;
  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    modifiedFiles++;
    totalReplacements += fileReplacements;
    const rel = relative(process.cwd(), filePath);
    console.log('  ✅ ' + rel + ' (' + fileReplacements + ' replacements)');
  }
}

console.log('');
console.log('--- Public Pages Summary ---');
console.log('  Files scanned:  ' + totalFiles);
console.log('  Files modified: ' + modifiedFiles);
console.log('  Total replacements: ' + totalReplacements);
console.log('');
console.log('Done! Run npx tsc --noEmit to verify.');
