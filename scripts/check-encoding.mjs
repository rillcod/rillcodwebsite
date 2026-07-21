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

const MOJIBAKE_PATTERNS = [
  { label: 'em dash corruption', regex: /â€"/g },
  { label: 'middle dot corruption', regex: /Â·/g },
  { label: 'ellipsis corruption', regex: /â€¦/g },
  { label: 'arrow corruption', regex: /â†'/g },
  { label: 'smart quote corruption', regex: /â€™|â€œ|â€\u009d/g },
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
