/**
 * Correct an academic session from the terminal, through the same code the
 * Settings screen uses.
 *
 * Nothing about the decision lives here — gatherRolloverPlan and
 * applyRolloverPlan are the platform's, so a correction run here and one run by
 * an admin in Settings → Academic Rules cannot disagree.
 *
 *   npx tsx scripts/correct-academic-session.ts --list
 *   npx tsx scripts/correct-academic-session.ts --from "Third Term 2025/2026" --to "First Term 2026/2027"
 *   npx tsx scripts/correct-academic-session.ts --from ... --to ... --apply
 *
 * Without --apply it only reports. Credentials come from .env.local; none are
 * written here.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { sessionTermLabel, summariseRolloverPlan } from '../src/lib/academic/session-rollover';
import {
  applyRolloverPlan,
  gatherRolloverPlan,
  type TermRow,
} from '../src/lib/academic/session-rollover-server';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}
const db = createClient(url, key) as any;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const wantsList = process.argv.includes('--list');
const wantsApply = process.argv.includes('--apply');

async function main() {
  const { data: terms } = await db
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .order('academic_year', { ascending: false })
    .order('term_number', { ascending: false });

  const all = (terms ?? []) as TermRow[];

  if (wantsList) {
    const [{ data: classes }, { data: plans }] = await Promise.all([
      db.from('classes').select('term_id'),
      db.from('lesson_plans').select('term_id'),
    ]);
    console.log('\nAcademic terms — what is filed against each:\n');
    for (const term of all) {
      const c = (classes ?? []).filter((r: any) => r.term_id === term.id).length;
      const p = (plans ?? []).filter((r: any) => r.term_id === term.id).length;
      console.log(
        `  ${sessionTermLabel(term).padEnd(24)} ${term.start_date ?? '?'} → ${term.end_date ?? '?'}` +
        `  classes=${String(c).padStart(3)}  plans=${String(p).padStart(3)}` +
        `${term.is_current ? '   [current]' : ''}`,
      );
    }
    console.log();
    return;
  }

  const fromLabel = arg('from');
  const toLabel = arg('to');
  if (!fromLabel || !toLabel) {
    console.error('Usage: --from "Third Term 2025/2026" --to "First Term 2026/2027" [--apply]   (or --list)');
    process.exit(1);
  }
  const find = (label: string) => all.find((term) => sessionTermLabel(term) === label);
  const from = find(fromLabel);
  const to = find(toLabel);
  if (!from || !to) {
    console.error(`Unknown term: ${!from ? fromLabel : toLabel}. Run --list to see the options.`);
    process.exit(1);
  }

  const plan = await gatherRolloverPlan(db, from, to);
  const summary = summariseRolloverPlan(plan);

  console.log(`\n${sessionTermLabel(from)}  →  ${sessionTermLabel(to)}\n`);
  console.log('  School adoptions      ', summary.adoptions);
  console.log('  Classes               ', summary.classes);
  console.log('  Roster rows to create ', summary.roster_rows_created);
  console.log('  Teaching plans        ', summary.lesson_plans);
  console.log('  Generated lessons     ', summary.lessons);
  console.log('  Flashcard decks       ', summary.flashcard_decks);
  console.log('  Assignments           ', summary.assignments);
  for (const assignment of plan.assignments) {
    console.log(`      ${assignment.id} → due ${assignment.due_date?.slice(0, 10)}`);
  }
  if (plan.adoption_conflicts.length) {
    console.log('\n  Left alone (already adopted for the target term):');
    for (const conflict of plan.adoption_conflicts) console.log(`      ${conflict.id} — ${conflict.reason}`);
  }
  if (plan.blocked.length) {
    console.log('\n  BLOCKED:');
    for (const reason of plan.blocked) console.log(`      ${reason}`);
  }

  if (plan.plans_awaiting_live_edition.length) {
    console.log(`\n  ${plan.plans_awaiting_live_edition.length} teaching plan(s) CANNOT move — their curriculum`);
    console.log('  edition has been retired. Publish a live edition for that course first:');
    const byRelease = new Map<string, number>();
    for (const stuck of plan.plans_awaiting_live_edition) {
      const key = stuck.release_id ?? 'none';
      byRelease.set(key, (byRelease.get(key) ?? 0) + 1);
    }
    for (const [release, count] of byRelease) console.log(`      ${count} plan(s) pinned to edition ${release}`);
  }

  if (plan.releases_needing_new_edition.length) {
    console.log('\n  Editions still naming the old session (immutable once published —');
    console.log('  publish a new edition through Curriculum Governance to relabel):');
    for (const release of plan.releases_needing_new_edition) {
      console.log(`      ${release.title}\n        suggested → ${release.suggested_title}`);
    }
  }

  console.log('\n  Never touched: progress reports, attendance, class sessions, timetables.\n');

  if (!wantsApply) {
    console.log('Dry run — nothing was changed. Re-run with --apply to write it.\n');
    return;
  }
  if (plan.blocked.length) {
    console.error('Refusing to apply while the plan is blocked.\n');
    process.exit(1);
  }

  const failures = await applyRolloverPlan(db, plan, null);
  if (failures.length) {
    console.error('\nApplied with problems:');
    for (const failure of failures) console.error(`   ${failure}`);
    process.exit(1);
  }
  console.log('Applied.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
