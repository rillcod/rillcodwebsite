#!/usr/bin/env node
/**
 * Fails when common UTF-8 mojibake sequences appear in source or docs.
 * Run: npm run lint:encoding
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'docs'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.sql']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'output', 'tmp', 'android', 'ios']);

// Files whose PURPOSE is to detect or repair mojibake necessarily contain the
// corrupted sequences as literals. Flagging them would make the check
// permanently red and train everyone to ignore it.
const ALLOWLIST = new Set([
  'src/lib/school-reports/pdf/text.ts',
].map((rel) => rel.split('/').join(path.sep)));

// Every pattern below is UTF-8 text decoded once as CP1252/Latin-1. Which lead
// byte you get depends on the original codepoint range:
//   U+2000-U+2FFF (em dash, middle dot, ellipsis, quotes) -> starts â
//   U+0080-U+00BF                                          -> starts Â
//   U+00C0-U+00FF (multiplication sign, accents)           -> starts Ã
// Only the first two were covered, so a mangled multiplication sign scanned
// clean and shipped into the invoice builder UI.
const MOJIBAKE_PATTERNS = [
  { label: 'em dash corruption', regex: /â€"/g },
  { label: 'middle dot corruption', regex: /Â·/g },
  { label: 'ellipsis corruption', regex: /â€¦/g },
  { label: 'arrow corruption', regex: /â†'/g },
  { label: 'smart quote corruption', regex: /â€™|â€œ|â€\u009d/g },
  {
    // Ã followed by another non-ASCII char is the Latin-1 signature. A lone
    // Ã is a real letter (Portuguese, Vietnamese) so it is never flagged
    // alone - only the two-character corruption sequence is.
    label: 'latin-1 range corruption',
    regex: /Ã[-ÿ–—‘’‚“”„†‡•…‰‹›ˆŒœŠšŸŽžƒ]/g,
  },
];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

async function main() {
  const targets = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(ROOT, dir);
    try {
      targets.push(...(await walk(full)));
    } catch {
      // directory may not exist in all environments
    }
  }

  const findings = [];
  for (const file of targets) {
    const text = await readFile(file, 'utf8');
    if (ALLOWLIST.has(path.relative(ROOT, file))) continue;
    for (const pattern of MOJIBAKE_PATTERNS) {
      const matches = text.match(pattern.regex);
      if (matches?.length) {
        findings.push({ file: path.relative(ROOT, file), label: pattern.label, count: matches.length });
      }
    }
  }

  if (!findings.length) {
    console.log(`Encoding check passed (${targets.length} files scanned).`);
    return;
  }

  console.error('Encoding corruption detected:\n');
  for (const row of findings) {
    console.error(`- ${row.file}: ${row.label} (${row.count})`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
