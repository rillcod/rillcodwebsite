#!/usr/bin/env npx tsx
/**
 * Scan src/ for Supabase select() embeds that commonly break against our schema.
 * Run: npx tsx scripts/audit-supabase-embeds.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src');

const RISKY: Array<{ name: string; test: (line: string) => boolean }> = [
  {
    name: 'unhinted portal_users(...)',
    test: (line) => /portal_users\s*\(\s*[^!]/.test(line) && /\.select\s*\(/.test(line),
  },
  {
    name: 'portal_users column hint without _fkey (ambiguous with student_performance_summary)',
    test: (line) =>
      /\.select\s*\(/.test(line) &&
      /portal_users![a-z_]+\(/.test(line) &&
      !/portal_users![a-z_]+_fkey/.test(line),
  },
  {
    name: 'aliased portal_users:col(...) without _fkey',
    test: (line) =>
      /\.select\s*\(/.test(line) &&
      /portal_users:[a-z_]+\(/.test(line) &&
      !/portal_users:[a-z_]+_fkey/.test(line),
  },
  {
    name: 'parent_student_links + portal_users!student_id (student_id → students)',
    test: (line) => /parent_student_links/.test(line) && /portal_users!student_id/.test(line),
  },
  {
    name: 'student_enrollments + portal_users embed (student_id → students)',
    test: (line) => /student_enrollments/.test(line) && /portal_users/.test(line),
  },
  {
    name: 'unhinted students(...) embed in select',
    test: (line) =>
      /\.select\s*\(/.test(line) &&
      /\bstudents\s*\(\s*[^!]/.test(line) &&
      !/students![a-z_]+_fkey/.test(line),
  },
  {
    name: 'unhinted classes(...) embed in select',
    test: (line) =>
      /\.select\s*\(/.test(line) &&
      /\bclasses\s*\(\s*[^!]/.test(line) &&
      !/classes![a-z_]+_fkey/.test(line),
  },
  {
    name: 'from(portal_users) + unhinted classes(...)',
    test: (line) => /from\s*\(\s*['"]portal_users['"]\s*\)/.test(line) && /classes\s*\(\s*[^!]/.test(line),
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
const findings: Array<{ file: string; rule: string; line: number; snippet: string }> = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('//') && line.trimStart().startsWith('//')) continue;
    for (const rule of RISKY) {
      if (!rule.test(line)) continue;
      findings.push({
        file: path.relative(process.cwd(), file),
        rule: rule.name,
        line: i + 1,
        snippet: line.trim().slice(0, 180),
      });
    }
  }
}

if (!findings.length) {
  console.log('No risky embed patterns found.');
  process.exit(0);
}

console.log(`Found ${findings.length} potential embed issues:\n`);
for (const f of findings) {
  console.log(`- [${f.rule}] ${f.file}:${f.line}`);
  console.log(`  ${f.snippet}\n`);
}
process.exit(1);
