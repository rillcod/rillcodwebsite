/**
 * Clears teaching content so every class rebuilds through the current pipeline.
 *
 * Keeps, always:
 *   - the protected programme named by KEEP_PROGRAMME
 *   - every student record (progress reports, submissions) — these are results,
 *     not teaching material, and nothing here touches them
 *   - any assignment that already has a submission attached to it, because
 *     deleting it would take a student's work with it
 *
 * Deletes, for every other programme: lesson plans, lessons, generated slide
 * decks (rows and their R2 objects), flashcard decks and their cards, and
 * assignments/projects that carry no submissions.
 *
 * Run with --apply to actually write. Without it, prints the plan and exits.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const KEEP_PROGRAMME = 'Summer School 2026';
const APPLY = process.argv.includes('--apply');

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { r2Delete } = await import('@/lib/r2/client');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const say = (m: string) => console.log(m);
  const step = (m: string) => console.log(`\n${m}`);

  // ── Resolve what is protected ────────────────────────────────────────────
  const { data: keepProg } = await db
    .from('programs').select('id,name').eq('name', KEEP_PROGRAMME).maybeSingle();
  if (!keepProg) {
    console.error(`Protected programme "${KEEP_PROGRAMME}" not found — refusing to run.`);
    process.exit(1);
  }
  const { data: keepCourses } = await db
    .from('courses').select('id').eq('program_id', (keepProg as any).id);
  const keepCourseIds = new Set((keepCourses ?? []).map((c: any) => c.id));

  const { data: allCourses } = await db.from('courses').select('id,program_id');
  const targetCourseIds = (allCourses ?? [])
    .map((c: any) => c.id)
    .filter((id: string) => !keepCourseIds.has(id));

  say(`Protected : ${KEEP_PROGRAMME} — ${keepCourseIds.size} courses (untouched)`);
  say(`In scope  : ${targetCourseIds.length} courses across every other programme`);
  say(APPLY ? '\nMODE: APPLY — changes will be written' : '\nMODE: DRY RUN — nothing will be written');

  if (!targetCourseIds.length) { say('Nothing in scope.'); process.exit(0); }

  // ── Protect student work ─────────────────────────────────────────────────
  const { data: subs } = await db.from('assignment_submissions').select('assignment_id');
  const assignmentsWithWork = new Set(
    (subs ?? []).map((s: any) => s.assignment_id).filter(Boolean),
  );

  const { data: assignments } = await db
    .from('assignments').select('id,title,assignment_type').in('course_id', targetCourseIds);
  const deletableAssignments = (assignments ?? []).filter(
    (a: any) => !assignmentsWithWork.has(a.id),
  );
  const keptAssignments = (assignments ?? []).filter((a: any) =>
    assignmentsWithWork.has(a.id),
  );

  // ── Gather everything else in scope ──────────────────────────────────────
  const { data: lessons } = await db.from('lessons').select('id').in('course_id', targetCourseIds);
  const lessonIds = (lessons ?? []).map((l: any) => l.id);

  const { data: plans } = await db.from('lesson_plans').select('id').in('course_id', targetCourseIds);
  const planIds = (plans ?? []).map((p: any) => p.id);

  const { data: decks } = await db.from('flashcard_decks').select('id').in('course_id', targetCourseIds);
  const deckIds = (decks ?? []).map((d: any) => d.id);

  // Slide decks hang off the lesson, not the course.
  const materials = lessonIds.length
    ? (await db.from('lesson_materials').select('id,file_url').in('lesson_id', lessonIds)).data ?? []
    : [];

  let cardCount = 0;
  if (deckIds.length) {
    const { count } = await db
      .from('flashcard_cards').select('*', { count: 'exact', head: true }).in('deck_id', deckIds);
    cardCount = count ?? 0;
  }

  step('Will delete:');
  say(`  lesson plans      ${planIds.length}`);
  say(`  lessons           ${lessonIds.length}`);
  say(`  lesson materials  ${materials.length}  (slide decks + their R2 files)`);
  say(`  flashcard decks   ${deckIds.length}  (${cardCount} cards)`);
  say(`  assignments       ${deletableAssignments.length}`);
  step('Will keep:');
  say(`  assignments with student submissions  ${keptAssignments.length}`);
  say(`  every progress report and submission  (untouched)`);
  say(`  all ${KEEP_PROGRAMME} content         (untouched)`);

  if (!APPLY) {
    say('\nDry run complete. Re-run with --apply to execute.');
    process.exit(0);
  }

  // ── Apply, children first ────────────────────────────────────────────────
  step('Applying…');

  // R2 objects first: once the row is gone the keys are unrecoverable.
  let removedFiles = 0;
  for (const m of materials as any[]) {
    try {
      const parsed = JSON.parse(String(m.file_url ?? '{}'));
      for (const key of parsed?.slides ?? []) {
        await r2Delete(key).catch(() => {});
        removedFiles++;
      }
    } catch { /* not a slide payload */ }
  }
  say(`  removed ${removedFiles} slide files from R2`);

  if (materials.length) {
    await db.from('lesson_materials').delete().in('id', (materials as any[]).map((m) => m.id));
    say(`  deleted ${materials.length} lesson materials`);
  }
  if (deckIds.length) {
    await db.from('flashcard_cards').delete().in('deck_id', deckIds);
    await db.from('flashcard_decks').delete().in('id', deckIds);
    say(`  deleted ${deckIds.length} flashcard decks (${cardCount} cards)`);
  }
  if (deletableAssignments.length) {
    await db.from('assignments').delete().in('id', deletableAssignments.map((a: any) => a.id));
    say(`  deleted ${deletableAssignments.length} assignments`);
  }
  if (lessonIds.length) {
    await db.from('lessons').delete().in('id', lessonIds);
    say(`  deleted ${lessonIds.length} lessons`);
  }
  if (planIds.length) {
    await db.from('lesson_plans').delete().in('id', planIds);
    say(`  deleted ${planIds.length} lesson plans`);
  }

  step('Done. Every remaining class rebuilds through the current pipeline.');
  process.exit(0);
})();
