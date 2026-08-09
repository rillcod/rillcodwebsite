/**
 * Do the dashboard counters agree with the data behind them?
 *
 * Written after a term roll silently zeroed them. The counters filtered classes
 * to live_academic_term_id(), which between terms is the term that has just
 * ended, while the classes had already moved to the term they will teach.
 * Every teacher read 0 classes while owning up to 12; every school read 0 while
 * running up to 5. Nothing errored — the number was simply wrong, which is the
 * kind of fault that survives for a whole term.
 *
 *   npx tsx scripts/audit-dashboard-counters.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as any;

async function all(table: string, select: string, filter?: (q: any) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const pad = (v: unknown, n = 3) => String(v).padStart(n);

async function main() {
  const { data: liveTermId } = await db.rpc('current_academic_term');
  const terms = await all('academic_terms', 'id,term_label,academic_year');
  const live = terms.find((t: any) => t.id === liveTermId);
  console.log(`\nLive term: ${live ? `${live.term_label} ${live.academic_year}` : liveTermId}\n`);

  const classes = await all('classes', 'id,teacher_id,school_id,status,term_id');
  const active = classes.filter((c: any) => c.status !== 'archived');

  let problems = 0;

  // ── Teachers ───────────────────────────────────────────────────────────────
  const teachers = await all('portal_users', 'id,full_name', (q) =>
    q.eq('role', 'teacher').eq('is_active', true));
  console.log('TEACHER DASHBOARD — classes');
  for (const t of teachers) {
    const { data: stats, error } = await db.rpc('get_teacher_dashboard_stats', { teacher_uuid: t.id });
    if (error) { console.log(`  ${t.full_name}: RPC failed — ${error.message}`); problems += 1; continue; }
    const owned = active.filter((c: any) => c.teacher_id === t.id).length;
    const ok = Number(stats.classes) === owned;
    if (!ok) problems += 1;
    console.log(`  ${String(t.full_name).slice(0, 24).padEnd(26)} shows=${pad(stats.classes)}  owns=${pad(owned)}  ${ok ? 'ok' : 'MISMATCH'}`);
  }

  // ── Schools ────────────────────────────────────────────────────────────────
  const schools = await all('schools', 'id,name');
  console.log('\nSCHOOL DASHBOARD — total_classes');
  let schoolProblems = 0;
  for (const s of schools) {
    const { data: stats, error } = await db.rpc('get_school_dashboard_stats', { school_uuid: s.id });
    if (error) { console.log(`  ${s.name}: RPC failed — ${error.message}`); problems += 1; continue; }
    const real = active.filter((c: any) => c.school_id === s.id).length;
    const ok = Number(stats.total_classes) === real;
    if (!ok) { problems += 1; schoolProblems += 1; }
    // Only print the interesting ones; 29 schools is a lot of noise otherwise.
    if (!ok || real > 0) {
      console.log(`  ${String(s.name).slice(0, 30).padEnd(32)} shows=${pad(stats.total_classes)}  actual=${pad(real)}  ${ok ? 'ok' : 'MISMATCH'}`);
    }
  }
  if (schoolProblems === 0) console.log('  (all schools agree)');

  console.log(
    problems === 0
      ? '\nEvery counter agrees with the data behind it.\n'
      : `\n${problems} counter(s) disagree with the data behind them.\n`,
  );
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
