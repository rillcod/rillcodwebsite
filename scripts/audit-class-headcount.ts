/**
 * Compare every class's stored headcount against the one definition.
 *
 * Uses classMemberIds — the same rule as active_class_student_count — so this
 * reports drift rather than inventing a third answer.
 *
 *   npx tsx scripts/audit-class-headcount.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { classMemberIds, contradictedLearners } from '../src/lib/rosters/membership';

config({ path: '.env.local' });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as any;

async function all(table: string, select: string, filter?: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from(table).select(select).range(from, from + 999);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function main() {
  const [classes, rosterRows, learners] = await Promise.all([
    all('classes', 'id,name,term_id,current_students'),
    all('class_term_rosters', 'class_id,student_id,term_id,status'),
    all('portal_users', 'id,class_id,is_active,is_deleted', (q) => q.eq('role', 'student')),
  ]);

  let drifted = 0;
  const lines: string[] = [];
  for (const klass of classes) {
    const correct = classMemberIds({
      classId: klass.id,
      termId: klass.term_id ?? null,
      rosterRows,
      learners,
    }).size;
    const stored = Number(klass.current_students ?? 0);
    if (stored !== correct) {
      drifted += 1;
      lines.push(`  ${String(klass.name ?? klass.id).slice(0, 44).padEnd(46)} stored=${String(stored).padStart(3)}  correct=${String(correct).padStart(3)}`);
    }
  }

  console.log(`\nClasses: ${classes.length}`);
  console.log(`Stored headcount wrong on: ${drifted}\n`);
  if (lines.length) console.log(lines.join('\n'));

  const contradicted = contradictedLearners({ rosterRows, learners });
  console.log(`\nLearners withdrawn on the roster but still tied to that class: ${contradicted.length}`);
  if (contradicted.length) {
    const byId = new Map(learners.map((l: any) => [l.id, l]));
    const classById = new Map(classes.map((c: any) => [c.id, c]));
    const names = await all('portal_users', 'id,full_name', (q) =>
      q.in('id', contradicted.map((c) => c.learnerId)));
    const nameById = new Map(names.map((n: any) => [n.id, n.full_name]));
    for (const row of contradicted) {
      console.log(`  ${nameById.get(row.learnerId) ?? row.learnerId} — ${classById.get(row.classId)?.name ?? row.classId}`);
    }
    console.log('\n  Not repaired automatically: whether each is back or gone is a decision');
    console.log('  about a child. Reinstate them, or complete the withdrawal.');
  }
  console.log('');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
