/**
 * Fill the empty teaching weeks of a school-pathway course from its spine.
 *
 *   npx tsx scripts/fill-school-spine.ts scratch            # dry run, changes nothing
 *   npx tsx scripts/fill-school-spine.ts scratch --apply    # writes
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Creative Coding with Scratch is taught by forty classes — the majority of the
 * school business — and its curriculum is thirty week titles with no lesson
 * plan and no subtopics on any of them. Python for Beginners, taught by sixteen
 * classes, has all thirty weeks complete. The lesson bodies for Scratch were
 * authored in src/lib/curriculum/school-spine-scratch-lessons.ts and never
 * connected to anything.
 *
 * ── Why it is safe ───────────────────────────────────────────────────────────
 *
 * attachSpineLessons is additive by construction: it keeps existing subtopics,
 * teacher activities, student activities, objectives and assessment plans
 * wherever a week already has them, and only fills what is absent. Running it
 * against a fully authored course is a no-op, which is why the dry run below
 * reports "0 weeks would change" for Python.
 *
 * The dry run is the default on purpose. --apply is a deliberate second step,
 * because this writes the content teachers deliver to children.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');

// Load env before importing anything that reads it.
for (const file of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(path.join(REPO, file), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // A missing .env.local is normal on CI; the environment is then the source.
  }
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const { attachSpineLessons } = await import('../src/lib/curriculum/school-spine-week');
  const { SCRATCH_LESSONS, SCRATCH_COURSE_META } = await import(
    '../src/lib/curriculum/school-spine-scratch-lessons'
  );
  const { PYTHON_LESSONS, PYTHON_COURSE_META } = await import(
    '../src/lib/curriculum/school-spine-python-lessons'
  );

  const SPINES = {
    scratch: {
      courseTitle: 'Creative Coding with Scratch',
      lessons: SCRATCH_LESSONS,
      meta: SCRATCH_COURSE_META,
    },
    python: {
      courseTitle: 'Python for Beginners',
      lessons: PYTHON_LESSONS,
      meta: PYTHON_COURSE_META,
    },
  } as const;

  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const which = args.find((arg) => !arg.startsWith('--')) as keyof typeof SPINES | undefined;

  if (!which || !(which in SPINES)) {
    console.error(`usage: npx tsx scripts/fill-school-spine.ts <${Object.keys(SPINES).join('|')}> [--apply]`);
    process.exit(1);
  }

  const spine = SPINES[which];
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  /** Counts what a week actually carries, so before/after is comparable. */
  function describe(content: any) {
    const terms = Array.isArray(content?.terms) ? content.terms : [];
    let weeks = 0;
    let withPlan = 0;
    let withSubtopics = 0;
    let withAssessment = 0;
    for (const term of terms) {
      for (const week of Array.isArray(term?.weeks) ? term.weeks : []) {
        weeks += 1;
        if (week?.lesson_plan) withPlan += 1;
        if (Array.isArray(week?.subtopics) && week.subtopics.length) withSubtopics += 1;
        if (week?.assessment_plan) withAssessment += 1;
      }
    }
    return { terms: terms.length, weeks, withPlan, withSubtopics, withAssessment };
  }

  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id, title')
    .eq('title', spine.courseTitle)
    .eq('is_active', true)
    .maybeSingle();

  if (courseError || !course) {
    console.error(`Course not found: ${spine.courseTitle}`, courseError?.message ?? '');
    process.exit(1);
  }

  const { data: curriculum, error: curriculumError } = await db
    .from('course_curricula')
    .select('id, content, version, school_id')
    .eq('course_id', course.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (curriculumError || !curriculum) {
    console.error(`No curriculum row for ${spine.courseTitle}`, curriculumError?.message ?? '');
    process.exit(1);
  }

  const before = describe(curriculum.content);
  const next = attachSpineLessons(curriculum.content, spine.lessons as any, spine.meta as any);
  const after = describe(next);

  console.log(`course      : ${course.title}`);
  console.log(`curriculum  : ${curriculum.id} (version ${curriculum.version ?? 1})`);
  console.log('');
  console.log('                     before   after');
  console.log(`terms              : ${String(before.terms).padStart(6)} ${String(after.terms).padStart(7)}`);
  console.log(`weeks              : ${String(before.weeks).padStart(6)} ${String(after.weeks).padStart(7)}`);
  console.log(`with lesson plan   : ${String(before.withPlan).padStart(6)} ${String(after.withPlan).padStart(7)}`);
  console.log(`with subtopics     : ${String(before.withSubtopics).padStart(6)} ${String(after.withSubtopics).padStart(7)}`);
  console.log(`with assessment    : ${String(before.withAssessment).padStart(6)} ${String(after.withAssessment).padStart(7)}`);
  console.log('');

  const gained = after.withPlan - before.withPlan;
  if (before.weeks !== after.weeks) {
    console.error(`REFUSING: week count would change (${before.weeks} -> ${after.weeks}).`);
    console.error('This should only ever fill existing weeks, never add or drop one.');
    process.exit(1);
  }
  if (gained <= 0) {
    console.log('Nothing to fill — every week already carries a lesson plan. No write needed.');
    process.exit(0);
  }
  console.log(`${gained} week${gained === 1 ? '' : 's'} would gain teaching content.`);

  if (!apply) {
    console.log('\nDry run. Nothing was written. Re-run with --apply to write.');
    process.exit(0);
  }

  const { error: writeError } = await db
    .from('course_curricula')
    .update({ content: next, updated_at: new Date().toISOString() })
    .eq('id', curriculum.id);

  if (writeError) {
    console.error('WRITE FAILED — nothing changed:', writeError.message);
    process.exit(1);
  }

  console.log('\nApplied.');

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
