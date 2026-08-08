/**
 * Every literal this codebase writes into a constrained column, checked against
 * what the database will actually accept.
 *
 * `check-schema-drift.ts` is the sibling of this check and covers reads: it
 * replays every select against the live schema. Nothing covered writes, and
 * that gap is not theoretical. Found on 2026-08-08:
 *
 *   students.status      three soft-delete paths wrote 'inactive'; the column
 *                        permits pending, approved and rejected. Postgres
 *                        rejects the whole update, so the row was not
 *                        soft-deleted at all — including in Class Health &
 *                        Repair, whose entire job is clearing those rows.
 *
 *   whatsapp_outbox      the parent milestone digest wrote 'pending'; the
 *                        column permits queued, processing, retry, sent,
 *                        delivered, read, failed and cancelled. It is the only
 *                        code that inserts there, so no milestone message has
 *                        ever reached a parent by WhatsApp.
 *
 * Both compiled, typechecked and passed the full suite. A Supabase client
 * reached through `as any` — which most call sites use — cannot see a check
 * constraint, and TypeScript has no way to know that 'inactive' is not a
 * permitted status. Only the database knows, so only the database can be asked.
 *
 * Precision matters more than reach here. The first version of this flagged six
 * writes and four were false: `pdf_status` inside a metadata object matched a
 * search for `status`, `match_status` is a different column with its own rules,
 * and two were results-array pushes that never touch the database. A check that
 * cries wolf is one everybody learns to skip, so this parses the object literal
 * actually handed to insert/update and reads only its top-level keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.join(process.cwd(), 'src');

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * The object literal handed to insert/update, from its opening brace.
 *
 * Brace counting rather than a regex, because these objects nest freely and a
 * lazy match stops at the first inner `}` — which is how a metadata sub-object
 * ended up being read as though it were a column list.
 */
function objectLiteralAt(src: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

/** Top-level `key: 'literal'` pairs only — never keys inside a nested object. */
function topLevelLiterals(objectSrc: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  let depth = 0;
  for (let i = 0; i < objectSrc.length; i += 1) {
    const ch = objectSrc[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    else if (depth === 1) {
      const m = /^([a-z_][a-z0-9_]*)\s*:\s*(['"])([^'"]*)\2/i.exec(objectSrc.slice(i));
      if (m && (i === 0 || /[{,\s]/.test(objectSrc[i - 1]))) {
        out.push({ key: m[1], value: m[3] });
        i += m[0].length - 1;
      }
    }
  }
  return out;
}

type Violation = {
  file: string;
  line: number;
  table: string;
  column: string;
  wrote: string;
  allowed: string[];
};

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const placeholder =
    !url || !key || /placeholder|example\.com|localhost/i.test(url) || /placeholder/i.test(key);
  if (placeholder) {
    console.log('[write-constraints] skipped — no real Supabase credentials.');
    // See the same note in check-schema-drift: a step that skipped and a step
    // that passed are indistinguishable on a green run, and that is precisely
    // how the three constraint violations this script exists to catch reached
    // main in the first place.
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(
        '::warning title=Write constraint check did not run::' +
          'No Supabase credentials, so every literal write went unchecked. ' +
          'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as repository secrets to enforce it.',
      );
    }
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('check_constraint_allowed_values');
  if (error) {
    console.log(`[write-constraints] skipped — ${error.message}`);
    return;
  }

  // table -> column -> permitted values
  const allowed = new Map<string, Map<string, Set<string>>>();
  for (const row of (data ?? []) as Array<{ table_name: string; column_name: string; allowed_value: string }>) {
    const cols = allowed.get(row.table_name) ?? new Map<string, Set<string>>();
    const vals = cols.get(row.column_name) ?? new Set<string>();
    vals.add(row.allowed_value);
    cols.set(row.column_name, vals);
    allowed.set(row.table_name, cols);
  }

  const violations: Violation[] = [];
  const WRITE = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)([\s\S]{0,600}?)\.(insert|update|upsert)\s*\(\s*\{/g;

  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(WRITE)) {
      const table = m[1];
      // Another .from() between the table and the write means they are not the
      // same statement.
      if (/\.from\(/.test(m[2])) continue;

      const cols = allowed.get(table);
      if (!cols) continue;

      const open = (m.index ?? 0) + m[0].length - 1;
      const literal = objectLiteralAt(src, open);
      if (!literal) continue;

      for (const { key: column, value } of topLevelLiterals(literal)) {
        const permitted = cols.get(column);
        if (!permitted || permitted.has(value)) continue;
        violations.push({
          file: path.relative(process.cwd(), file).split(path.sep).join('/'),
          line: src.slice(0, m.index ?? 0).split('\n').length,
          table,
          column,
          wrote: value,
          allowed: [...permitted].sort(),
        });
      }
    }
  }

  console.log(`[write-constraints] checked every literal write against ${allowed.size} constrained tables.`);

  if (!violations.length) {
    console.log('[write-constraints] every write is a value the database accepts.');
    return;
  }

  console.error(`\n[write-constraints] ${violations.length} write(s) the database will reject:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.table}.${v.column} = '${v.wrote}'`);
    console.error(`    permitted: ${v.allowed.join(', ')}\n`);
  }
  console.error(
    'Postgres rejects the whole statement, so nothing in that insert or update is\n' +
    'written — not just the offending column. Most call sites discard the error,\n' +
    'so the feature looks like it did nothing rather than like it failed.\n'
  );
  process.exit(1);
}

main().catch((err) => {
  // Never fail a build over the checker itself.
  console.log(`[write-constraints] skipped — ${err instanceof Error ? err.message : err}`);
});
