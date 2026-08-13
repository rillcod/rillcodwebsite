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

/**
 * Top-level `key: value` pairs only — never keys inside a nested object.
 *
 * `value` is the literal when there is one, or the identifier when the column is
 * set from a variable. Reading only literals is what let the students.status bug
 * through: the value was computed a few lines above the write.
 */
function topLevelEntries(objectSrc: string): Array<{ key: string; literal?: string; ident?: string }> {
  const out: Array<{ key: string; literal?: string; ident?: string }> = [];
  let depth = 0;
  for (let i = 0; i < objectSrc.length; i += 1) {
    const ch = objectSrc[i];
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1;
    else if (depth === 1 && (i === 0 || /[{,\s]/.test(objectSrc[i - 1]))) {
      const lit = /^([a-z_][a-z0-9_]*)\s*:\s*(['"])([^'"]*)\2/i.exec(objectSrc.slice(i));
      if (lit) {
        out.push({ key: lit[1], literal: lit[3] });
        i += lit[0].length - 1;
        continue;
      }
      // `status: newStatus` — a bare identifier, not a call, member access or
      // expression. Anything more involved is not worth guessing at.
      const ref = /^([a-z_][a-z0-9_]*)\s*:\s*([a-z_$][a-z0-9_$]*)\s*[,}]/i.exec(objectSrc.slice(i));
      if (ref) {
        out.push({ key: ref[1], ident: ref[2] });
        i += ref[0].length - 2;
      }
    }
  }
  return out;
}

/**
 * Every string literal assigned to a name before it is used.
 *
 * Deliberately shallow. It reads `x = 'a'`, `let x = 'a'` and `x = cond ? 'a' :
 * 'b'` within the same file, ahead of the write. That is enough for the shape
 * this exists to catch — a status worked out over a few branches and then
 * written — and stops well short of tracking values across functions, which
 * would need a real type checker and would start inventing findings.
 *
 * A name assigned from something that is not a literal (another variable, a
 * call, a column read) contributes nothing, so a variable that never holds a
 * literal is simply not checked rather than guessed at.
 */
function literalsAssignedTo(src: string, ident: string, before: number): string[] {
  const scope = src.slice(Math.max(0, before - 6000), before);
  const found = new Set<string>();
  const name = ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * A destructuring default is not an assignment.
   *
   * `const { transactionId, status = 'success' } = await req.json()` says "use
   * this when the caller omits it", and the value usually cannot reach the write
   * at all — /api/payments/approve rejects anything but success or failed, and
   * then writes `status` only on the branch where it is NOT 'success'. Reading
   * that default as a written value reported a correctly guarded route as
   * broken, which is the kind of finding that teaches people to ignore the tool.
   */
  const isDestructuringDefault = (at: number): boolean => {
    const lineStart = scope.lastIndexOf('\n', at) + 1;
    let lineEnd = scope.indexOf('\n', at);
    if (lineEnd < 0) lineEnd = scope.length;
    const line = scope.slice(lineStart, lineEnd);
    return /[{,]\s*[a-z_$][\w$]*\s*=/i.test(line) && /\}\s*=/.test(line);
  };

  for (const m of scope.matchAll(new RegExp(`\\b${name}\\s*=\\s*(['"])([^'"]*)\\1`, 'g'))) {
    if (isDestructuringDefault(m.index ?? 0)) continue;
    found.add(m[2]);
  }
  // Ternaries: `x = cond ? 'a' : 'b'` — both arms are candidate values.
  for (const m of scope.matchAll(new RegExp(`\\b${name}\\s*=\\s*[^;\\n]*\\?\\s*(['"])([^'"]*)\\1\\s*:\\s*(['"])([^'"]*)\\3`, 'g'))) {
    found.add(m[2]);
    found.add(m[4]);
  }
  return [...found];
}

type Violation = {
  file: string;
  line: number;
  table: string;
  column: string;
  wrote: string;
  allowed: string[];
};

/**
 * Give up without failing, unless the caller said this check must run.
 *
 * STRICT_WRITE_CONSTRAINTS=1 is the sibling of STRICT_SCHEMA_DRIFT=1. CI turns it
 * on whenever the service-role secret is configured, which separates the two cases
 * that used to look the same on a green run: "this repo never set credentials"
 * (fine, skip) and "this repo set them and the check still could not run" (a
 * misconfiguration hiding every write from the only thing that inspects them).
 */
function giveUp(reason: string, annotation?: string): never {
  const strict = process.env.STRICT_WRITE_CONSTRAINTS === '1';
  console.log(`[write-constraints] ${strict ? 'FAILED' : 'skipped'} — ${reason}`);
  if (process.env.GITHUB_ACTIONS === 'true' && annotation) {
    console.log(`::${strict ? 'error' : 'warning'} title=Write constraint check did not run::${annotation}`);
  }
  process.exit(strict ? 1 : 0);
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const placeholder =
    !url || !key || /placeholder|example\.com|localhost/i.test(url) || /placeholder/i.test(key);
  if (placeholder) {
    // See the same note in check-schema-drift: a step that skipped and a step
    // that passed are indistinguishable on a green run, and that is precisely
    // how the three constraint violations this script exists to catch reached
    // main in the first place.
    giveUp(
      'no real Supabase credentials.',
      'No Supabase credentials, so every literal write went unchecked. ' +
        'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as repository secrets to enforce it.',
    );
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('check_constraint_allowed_values');
  if (error) {
    // Credentials were good enough to build a client, so reaching here in CI means
    // the check is configured and still not running — the case strict mode exists for.
    giveUp(
      error.message,
      `Credentials are configured but check_constraint_allowed_values failed: ${error.message}`,
    );
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

      for (const entry of topLevelEntries(literal)) {
        const permitted = cols.get(entry.key);
        if (!permitted) continue;

        // A literal is checked as written. An identifier is checked against
        // every literal assigned to it beforehand — the shape that produced the
        // students.status bug, where 'paid' and 'partially_paid' were worked out
        // over two branches and only then written.
        const candidates = entry.literal !== undefined
          ? [entry.literal]
          : literalsAssignedTo(src, entry.ident!, m.index ?? 0);

        for (const value of candidates) {
          if (permitted.has(value)) continue;
          violations.push({
            file: path.relative(process.cwd(), file).split(path.sep).join('/'),
            line: src.slice(0, m.index ?? 0).split('\n').length,
            table,
            column: entry.key,
            wrote: entry.ident ? `${value}  (via ${entry.ident})` : value,
            allowed: [...permitted].sort(),
          });
        }
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
  // A crash in the checker does not fail an unconfigured build — but where the
  // check is meant to be enforced, a checker that cannot finish is a failure, not
  // a pass. Otherwise the one step that inspects writes is silenced by its own bug.
  giveUp(err instanceof Error ? err.message : String(err), 'The write constraint checker crashed before it could finish.');
});
