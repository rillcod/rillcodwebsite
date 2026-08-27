#!/usr/bin/env npx tsx
/**
 * Replay every Supabase select() in src/ against the real database and fail on any the database
 * refuses. Run: npx tsx scripts/check-schema-drift.ts
 *
 * This catches a class of bug nothing else in the stack can see. `.select('id, total_marks')` is
 * just a string to TypeScript, so `tsc --noEmit` passes; the unit tests mock Supabase, so they
 * pass too; and most call sites discard the error, so a refused query looks exactly like "no
 * records yet". A sweep in July 2026 found 38 broken reads that had accumulated in that blind
 * spot — parents seeing no exam results, administrators seeing no consent responses, content
 * generation that had never once run.
 *
 * `audit-supabase-embeds.ts` is the static sibling of this check: it matches known-risky patterns
 * without a database. This one asks the database itself, so it also catches columns that were
 * renamed or never existed.
 *
 * Skips (exit 0) when no service-role credentials are present, so a fork or a CI job without
 * secrets is not blocked. Set STRICT_SCHEMA_DRIFT=1 to make a missing key a failure instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { runSchemaProbeWithRetry } from '../src/lib/supabase/schema-probe';

const ROOT = path.join(process.cwd(), 'src');
const CONCURRENCY = 24;

/** Read .env.local without adding a dotenv dependency; real env vars win. */
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...(process.env as Record<string, string>) };
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    if (out[k]) continue;
    out[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const p = path.join(dir, entry);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

type Query = { table: string; cols: string; file: string; line: number };

/** `.from('table')` followed by `.select('...')` with only chained calls between. */
const PAIR = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)\s*\.select\(\s*(['"`])([\s\S]*?)\2/g;

/**
 * Continue a select that is written as several string literals joined by `+`.
 *
 * PAIR stops at the first closing quote, so a select split across lines was read
 * only as far as its first piece. A long column list broken for readability —
 *
 *     .select(
 *       "id,school_id,created_by,academic_offering_id," +
 *       "courses(title),classes!lesson_plans_class_id_fkey(id,name)"
 *     )
 *
 * — was reported as ending in a trailing comma and "refused by the database",
 * when the query the database actually receives is perfectly valid. A checker
 * that invents failures is worse than one that misses them: it costs a real
 * investigation, and it teaches everyone to distrust the output.
 *
 * Returns the remaining literals joined, or '' when the select ends here.
 */
function continuedLiterals(src: string, from: number): string {
  let index = from;
  let out = '';

  for (;;) {
    // Only whitespace and a single `+` may sit between one literal and the next.
    const gap = /^\s*\+\s*/.exec(src.slice(index));
    if (!gap) return out;
    index += gap[0].length;

    const quote = src[index];
    if (quote !== '"' && quote !== "'" && quote !== '`') return out;

    let end = index + 1;
    while (end < src.length && src[end] !== quote) {
      if (src[end] === '\\') end += 1; // an escaped quote is not the end
      end += 1;
    }
    if (end >= src.length) return out; // unterminated — take what we have

    out += src.slice(index + 1, end);
    index = end + 1;
  }
}

/**
 * Resolve `${CONST}` in a select when CONST is a plain string constant in the same file.
 *
 * Skipping every interpolated select is what let the worst bug of this sweep through: the official
 * curriculum direction resolver built its embed as `academic_curriculum_releases(${RELEASE_SELECT})`,
 * the embed was ambiguous, and the check never looked. Publishing then reached 29 schools while
 * every class still reported "no official edition assigned".
 */
function resolveInterpolations(cols: string, src: string): string | null {
  let out = cols;
  for (const ref of cols.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) {
    const name = ref[1];
    const decl = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(['"\`])([\\s\\S]*?)\\1`).exec(src);
    if (!decl) return null; // not a simple local string constant — cannot resolve safely
    out = out.replace(ref[0], decl[2].replace(/\s+/g, ' ').trim());
  }
  return out.includes('${') ? null : out;
}

function collect(): Query[] {
  const seen = new Set<string>();
  const queries: Query[] = [];
  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(PAIR)) {
      const table = m[1];
      // m.index + m[0].length lands just past the first literal's closing quote,
      // which is exactly where a `+ "…"` continuation would start.
      const rest = continuedLiterals(src, (m.index ?? 0) + m[0].length);
      let cols = (m[3] + rest).replace(/\s+/g, ' ').trim();
      if (cols.includes('${')) {
        const resolved = resolveInterpolations(cols, src);
        // Still dynamic (built from a variable or another module) — genuinely uncheckable here.
        if (!resolved) continue;
        cols = resolved;
      }
      if (!cols) continue;
      const key = `${table}|${cols}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queries.push({
        table,
        cols,
        file: path.relative(process.cwd(), file).split(path.sep).join('/'),
        line: src.slice(0, m.index ?? 0).split('\n').length,
      });
    }
  }
  return queries;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const strict = env.STRICT_SCHEMA_DRIFT === '1';

  // CI defines placeholder Supabase values so the build can run without secrets. Pointing this
  // check at those would report all ~1500 queries as broken, which is noise, not signal.
  const placeholder =
    !url || !key || /placeholder|example\.com|localhost/i.test(url) || /placeholder/i.test(key);

  if (placeholder) {
    console.log(
      `[schema-drift] no real service-role credentials (URL: ${url || 'unset'}) — ${
        strict ? 'failing (STRICT_SCHEMA_DRIFT=1)' : 'skipping'
      }.`,
    );
    console.log('[schema-drift] set real NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enforce.');

    // A skipped step and a passed step look identical on a green run, and this
    // one had been skipping since it was written — which is how three queries
    // the database refuses outright survived in main. An annotation puts it on
    // the run summary rather than three hundred lines into a log nobody opens.
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(
        '::warning title=Schema drift check did not run::' +
          'No Supabase credentials, so ~1500 queries went unchecked. ' +
          'Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as repository secrets to enforce it.',
      );
    }
    process.exit(strict ? 1 : 0);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const queries = collect();
  const failures: Array<Query & { code: string; message: string }> = [];
  const transportFailures: Array<Query & { code: string; message: string }> = [];
  let transientRetriesRecovered = 0;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queries.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= queries.length) return;
        const q = queries[i];
        // limit(0) asks PostgREST to parse and plan the query without returning rows.
        const probe = await runSchemaProbeWithRetry(async () => {
          const { error } = await db.from(q.table).select(q.cols, { count: 'exact' }).limit(0);
          return error;
        });
        if (!probe.error && probe.attempts > 1) transientRetriesRecovered += 1;
        if (probe.error) {
          const destination = probe.transient ? transportFailures : failures;
          destination.push({
            ...q,
            code: probe.error.code ?? '?',
            message: probe.error.message ?? 'Unknown database response',
          });
        }
      }
    }),
  );

  console.log(`[schema-drift] checked ${queries.length} distinct queries against the live schema.`);
  if (transientRetriesRecovered > 0) {
    console.log(
      `[schema-drift] ${transientRetriesRecovered} transient gateway response(s) passed on retry.`,
    );
  }

  if (transportFailures.length > 0) {
    console.error(
      `\n[schema-drift] ${transportFailures.length} query(s) could not be verified after three gateway retries:\n`,
    );
    for (const failure of transportFailures) {
      console.error(`  ${failure.file}:${failure.line}  [${failure.code}]`);
      console.error(`    ${failure.message}\n`);
    }
    console.error(
      'This run is inconclusive, not a schema pass. Retry when the database gateway is healthy.\n',
    );
    process.exit(1);
  }

  if (failures.length === 0) {
    console.log('[schema-drift] all queries accepted.');
    return;
  }

  failures.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  console.error(`\n[schema-drift] ${failures.length} query(s) the database refuses:\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  [${f.code}]`);
    console.error(`    .from('${f.table}').select('${f.cols.slice(0, 100)}${f.cols.length > 100 ? '…' : ''}')`);
    console.error(`    ${f.message}\n`);
  }
  console.error(
    'Each of these returns nothing at runtime, and most call sites discard the error, so the\n' +
    'feature looks empty rather than broken. Fix the column or embed — do not add a column\n' +
    'just to satisfy the query unless something actually writes to it.\n',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('[schema-drift] check could not run:', err);
  process.exit(1);
});
