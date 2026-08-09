/**
 * Archive teaching plans stranded on a withdrawn curriculum edition.
 *
 * When the Academic Office retires an edition, the plans built from it cannot
 * follow anything else. The database refuses to repoint them —
 * attach_official_direction_to_lesson_plan raises "This teaching plan keeps the
 * official direction it started with" — and its hint gives the intended remedy:
 * create the future term plan from the new direction instead of rewriting this
 * record.
 *
 * That guard also blocks the daily sweep, which runs as a service account and so
 * has no auth.uid() to check a role against. Nothing repairs these on its own.
 *
 * Archiving is the move the guard leaves open: status is not one of the columns
 * the trigger watches, and lesson_plans_active_class_term_course_unique excludes
 * archived rows. Once archived, the sweep stops treating the old row as the
 * class's plan and builds a fresh one from the live edition.
 *
 * Nothing is deleted. An archived plan keeps its weeks and its history.
 *
 *   npx tsx scripts/retire-stranded-plans.ts            # report only
 *   npx tsx scripts/retire-stranded-plans.ts --apply
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as any;

const APPLY = process.argv.includes('--apply');

async function main() {
  const { data: retired, error: releaseError } = await db
    .from('academic_curriculum_releases')
    .select('id, title, status')
    .eq('status', 'retired');
  if (releaseError) throw new Error(releaseError.message);
  if (!retired?.length) {
    console.log('\nNo retired editions. Nothing can be stranded.\n');
    return;
  }

  const retiredIds = retired.map((r: any) => r.id);
  const { data: plans, error: planError } = await db
    .from('lesson_plans')
    .select('id, status, term_id, class_id, course_id, curriculum_release_id, classes(name)')
    .in('curriculum_release_id', retiredIds)
    .neq('status', 'archived');
  if (planError) throw new Error(planError.message);

  console.log(`\nRetired editions: ${retired.length}`);
  for (const r of retired) console.log(`  ${r.id.slice(0, 8)}  ${r.title}`);

  if (!plans?.length) {
    console.log('\nNo live plans are stranded on them.\n');
    return;
  }

  // Does a usable plan already exist for the same class and course?
  const { data: replacements } = await db
    .from('lesson_plans')
    .select('class_id, course_id, curriculum_release_id')
    .in('class_id', plans.map((p: any) => p.class_id))
    .neq('status', 'archived')
    .not('curriculum_release_id', 'in', `(${retiredIds.join(',')})`);
  const covered = new Set((replacements ?? []).map((r: any) => `${r.class_id}|${r.course_id}`));

  console.log(`\nStranded plans: ${plans.length}\n`);
  for (const p of plans) {
    const has = covered.has(`${p.class_id}|${p.course_id}`);
    console.log(
      `  ${String(p.classes?.name ?? p.class_id).slice(0, 38).padEnd(40)}` +
      ` ${String(p.status).padEnd(10)}` +
      ` ${has ? 'replacement already exists' : 'no replacement yet — the sweep will build one'}`,
    );
  }

  if (!APPLY) {
    console.log('\nReport only. Re-run with --apply to archive them.');
    console.log('Nothing is deleted: an archived plan keeps its weeks and its history.\n');
    return;
  }

  let archived = 0;
  const failures: string[] = [];
  for (const p of plans) {
    const { error } = await db
      .from('lesson_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) failures.push(`${p.classes?.name ?? p.id}: ${error.message}`);
    else archived += 1;
  }

  console.log(`\nArchived ${archived} of ${plans.length}.`);
  if (failures.length) {
    console.log('\nCould not archive:');
    for (const f of failures) console.log(`  ${f}`);
  }
  console.log('\nThe next daily run builds each class a fresh plan from its live edition.');
  console.log('Publish those in Academic Office → Lesson Plans → Approvals.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
