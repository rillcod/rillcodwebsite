/**
 * Apply ONE migration file to the live database, through the Supabase
 * Management API.
 *
 *   node scripts/apply-migration.mjs 20260929000115_lock_anon_out_of_money_and_people.sql
 *
 * Why this exists: deploy-migrations.mjs replays the whole folder against a
 * host that no longer resolves. Replaying everything is not what you want once
 * a baseline has been squashed — you want the one file you just wrote, applied
 * once, and recorded so the migration history matches reality.
 *
 * The file is sent as a single statement batch, so the BEGIN/COMMIT inside each
 * migration does the work: either the whole file lands or none of it does.
 *
 * Pass --dry-run to print the SQL and exit without touching anything.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSql, PROJECT_REF } from './_credentials.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, '..', 'supabase', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const name = args.find((a) => !a.startsWith('--'));

if (!name) {
  console.error('usage: node scripts/apply-migration.mjs <migration-filename> [--dry-run]');
  process.exit(1);
}

let sql;
try {
  sql = readFileSync(path.join(MIGRATIONS, name), 'utf8');
} catch {
  console.error(`No such migration: ${name}`);
  console.error(`Looked in ${MIGRATIONS}`);
  process.exit(1);
}

console.log(`project : ${PROJECT_REF}`);
console.log(`file    : ${name}`);
console.log(`size    : ${sql.split(/\r?\n/).length} lines`);

if (dryRun) {
  console.log('\n--- dry run, nothing sent ---\n');
  console.log(sql);
  process.exit(0);
}

const { ok, status, body } = await runSql(sql);

if (!ok) {
  console.error(`\nFAILED (${status}) — nothing was committed.`);
  console.error(body.slice(0, 1500));
  process.exit(1);
}

console.log(`\napplied OK (${status})`);

// Record it, so migration history reflects what is actually in the database.
// Failing to record is not fatal: the schema change already committed above,
// and a missing history row is a bookkeeping problem, not a broken database.
const version = name.split('_')[0];
const recorded = await runSql(
  `insert into supabase_migrations.schema_migrations (version, name)
   values ('${version}', '${name.replace(/'/g, "''")}')
   on conflict (version) do nothing;`,
);

console.log(
  recorded.ok
    ? `history : recorded ${version}`
    : `history : NOT recorded (${recorded.status}) — schema change did apply; record it by hand.\n          ${recorded.body.slice(0, 200)}`,
);
