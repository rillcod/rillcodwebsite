/**
 * Bulk Glass UI Upgrade Script
 * 
 * Transforms legacy dashboard page containers from:
 *   bg-card border border-border rounded-xl/rounded-2xl
 * To the standard glass container pattern:
 *   bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl
 * 
 * Also fixes mobile-responsive padding (p-5/p-6 → p-4 sm:p-6).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(process.cwd(), 'src');
const DASHBOARD_ROOT = join(ROOT, 'app', 'dashboard');
const COMPONENTS_ROOT = join(ROOT, 'components');

// ── Replacement rules ──────────────────────────────────────────
// Order matters: more specific patterns first to avoid double-matching.
const REPLACEMENTS = [
  // --- Outer container cards (primary section wrappers) ---
  
  // bg-card shadow-sm border border-border rounded-xl p-5 sm:p-7
  [
    /bg-card shadow-sm border border-border rounded-xl p-5 sm:p-7/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card shadow-sm border border-border rounded-xl p-5 sm:p-6
  [
    /bg-card shadow-sm border border-border rounded-xl p-5 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card shadow-sm border border-border rounded-xl p-5
  [
    /bg-card shadow-sm border border-border rounded-xl p-5(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  
  // bg-card border border-border rounded-2xl p-5 sm:p-6
  [
    /bg-card border border-border rounded-2xl p-5 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card border border-border rounded-2xl p-6
  [
    /bg-card border border-border rounded-2xl p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl'
  ],
  // bg-card border border-border rounded-2xl p-5
  [
    /bg-card border border-border rounded-2xl p-5(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card border border-border rounded-2xl p-4
  [
    /bg-card border border-border rounded-2xl p-4(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  
  // bg-card border border-border rounded-xl p-5 sm:p-6
  [
    /bg-card border border-border rounded-xl p-5 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card border border-border rounded-xl p-4 sm:p-6
  [
    /bg-card border border-border rounded-xl p-4 sm:p-6/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card border border-border rounded-xl p-5 (standalone)
  [
    /bg-card border border-border rounded-xl p-5(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],
  // bg-card border border-border rounded-xl p-4 (standalone)
  [
    /bg-card border border-border rounded-xl p-4(?!\s*sm:)/g,
    'bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl'
  ],

  // --- Skeleton / loading cards ---
  [
    /bg-card border border-border animate-pulse rounded-xl/g,
    'bg-card/90 border border-border/80 animate-pulse rounded-2xl'
  ],
];

// ── File walker ─────────────────────────────────────────────────
function walk(dir, ext = '.tsx') {
  let results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results = results.concat(walk(full, ext));
      } else if (full.endsWith(ext)) {
        results.push(full);
      }
    }
  } catch { /* dir doesn't exist */ }
  return results;
}

// ── Main ────────────────────────────────────────────────────────
let totalFiles = 0;
let modifiedFiles = 0;
let totalReplacements = 0;

const targets = [
  ...walk(DASHBOARD_ROOT, '.tsx'),
  ...walk(join(COMPONENTS_ROOT, 'dashboard'), '.tsx'),
  ...walk(join(COMPONENTS_ROOT, 'billing'), '.tsx'),
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
console.log('--- Summary ---');
console.log('  Files scanned:  ' + totalFiles);
console.log('  Files modified: ' + modifiedFiles);
console.log('  Total replacements: ' + totalReplacements);
console.log('');
console.log('Done! Run npx tsc --noEmit to verify.');
