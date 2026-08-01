/**
 * GET /api/academic/pipeline — where teaching content actually stops.
 *
 * Weekly content only appears if a whole chain holds: a curriculum is written, published as an
 * edition, adopted by schools, matched to a class's course, turned into a teaching plan, then
 * generated week by week. Every link reports separately today — the roster shows curricula, the
 * rollout page shows editions, Operations Health shows whether a job ran — so a break anywhere
 * looks like "nothing happened" everywhere.
 *
 * This returns the count at each link, and names the classes that are stuck, so the break is
 * visible in one read instead of inferred from four screens.
 */
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeInference, inferClassCourse } from '@/lib/academic/infer-class-course';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_active || profile.is_deleted || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
  }

  const [curricula, releases, adoptions, classRows, plans, health] = await Promise.all([
    db.from('course_curricula').select('id, school_id, content'),
    db.from('academic_curriculum_releases').select('id, title, course_id, status, academic_session'),
    db.from('academic_curriculum_adoptions').select('school_id, course_id, status'),
    db.from('classes').select('id, name, program_id, school_id, current_course_id, status'),
    db.from('lesson_plans').select('id, status, class_id, course_id'),
    db.from('cron_job_health')
      .select('job_name, last_finished_at, last_success_at, consecutive_failures, last_error')
      .in('job_name', ['academic-readiness', 'auto-generate-content']),
  ]);

  const firstError = curricula.error || releases.error || adoptions.error || classRows.error || plans.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  const classes = classRows.data ?? [];
  const programIds = Array.from(new Set(classes.map((c: any) => c.program_id).filter(Boolean)));
  const [{ data: courseRows }, { data: programRows }] = await Promise.all([
    programIds.length
      ? db.from('courses').select('id, title, program_id').in('program_id', programIds)
      : Promise.resolve({ data: [] as any[] }),
    programIds.length
      ? db.from('programs').select('id, name').in('id', programIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const programName = new Map<string, string>();
  for (const row of programRows ?? []) programName.set(row.id, row.name);

  const coursesByProgram = new Map<string, string[]>();
  const courseTitle = new Map<string, string>();
  for (const row of courseRows ?? []) {
    courseTitle.set(row.id, row.title);
    const list = coursesByProgram.get(row.program_id) ?? [];
    list.push(row.id);
    coursesByProgram.set(row.program_id, list);
  }

  const activeAdoptions = (adoptions.data ?? []).filter((a: any) => a.status === 'active');
  const adoptedBySchool = new Map<string, string[]>();
  for (const a of activeAdoptions) {
    const list = adoptedBySchool.get(a.school_id) ?? [];
    list.push(a.course_id);
    adoptedBySchool.set(a.school_id, list);
  }

  // Replay exactly what readiness will decide, so this view and the job cannot disagree.
  const resolved: Array<{ id: string; name: string; via: string }> = [];
  const stuck: Array<{ id: string; name: string; reason: string; programId: string | null }> = [];
  let alreadySet = 0;

  for (const klass of classes) {
    const programmeCourses = klass.program_id ? coursesByProgram.get(klass.program_id) ?? [] : [];
    const adopted = klass.school_id ? adoptedBySchool.get(klass.school_id) ?? [] : [];
    const inference = inferClassCourse({
      currentCourseId: klass.current_course_id,
      programmeCourses,
      adoptedCourseIds: adopted,
    });
    if (inference.reason === 'already_set') { alreadySet += 1; continue; }
    if (inference.courseId) {
      resolved.push({ id: klass.id, name: klass.name, via: inference.reason });
    } else {
      const adoptedInProgramme = programmeCourses.filter((id) => adopted.includes(id)).length;
      stuck.push({
        id: klass.id,
        name: klass.name,
        reason: describeInference(inference, adoptedInProgramme),
        programId: klass.program_id ?? null,
      });
    }
  }

  // Grouped by programme, because the fix is usually one act per programme rather than one per
  // class: publish a single course and every class in that programme resolves, since one live
  // edition leaves nothing to choose between. Reading the flat list, that is invisible.
  const publishedCourseIds = new Set(
    (releases.data ?? []).filter((r: any) => r.status === 'published').map((r: any) => r.course_id),
  );
  const blockedByProgramme = Object.values(
    stuck.reduce((acc: Record<string, any>, klass) => {
      const key = klass.programId ?? 'none';
      const courses = klass.programId ? coursesByProgram.get(klass.programId) ?? [] : [];
      acc[key] ??= {
        programId: klass.programId,
        programme: klass.programId ? programName.get(klass.programId) ?? 'Unknown programme' : 'No programme',
        classCount: 0,
        courseCount: courses.length,
        publishedCount: courses.filter((id) => publishedCourseIds.has(id)).length,
        classes: [] as string[],
      };
      acc[key].classCount += 1;
      acc[key].classes.push(klass.name);
      return acc;
    }, {}),
  ).sort((a: any, b: any) => b.classCount - a.classCount);

  const central = (curricula.data ?? []).filter((c: any) => !c.school_id);
  const published = (releases.data ?? []).filter((r: any) => r.status === 'published');
  const planRows = plans.data ?? [];

  const jobs: Record<string, unknown> = {};
  for (const row of health.data ?? []) jobs[row.job_name] = row;

  return NextResponse.json({
    // Ordered as the chain runs, so the first zero is the break.
    steps: [
      {
        key: 'curriculum',
        label: 'Curricula written',
        count: central.length,
        detail: `${central.length} central, ${(curricula.data ?? []).length - central.length} school copies`,
      },
      {
        key: 'published',
        label: 'Published editions',
        count: published.length,
        detail: published.length
          ? published.map((r: any) => `${r.title} (${r.academic_session ?? 'no session'})`).join('; ')
          : 'Nothing is published, so no school can teach from it.',
      },
      {
        key: 'adopted',
        label: 'School adoptions',
        count: activeAdoptions.length,
        detail: 'Publishing assigns these automatically to every eligible school.',
      },
      {
        key: 'classes',
        label: 'Classes with a course',
        count: alreadySet + resolved.length,
        detail: `${alreadySet} already set, ${resolved.length} will be set automatically on the next readiness run`,
      },
      {
        key: 'plans',
        label: 'Teaching plans',
        count: planRows.length,
        detail: planRows.length
          ? `${planRows.filter((p: any) => p.status === 'published').length} published`
          : 'Created by academic-readiness once a class has a course and a term.',
      },
    ],
    blocked: stuck,
    blockedByProgramme,
    // What has actually been published, per programme. "1 published edition" says nothing about
    // which programme it serves, and a programme with none is the reason its classes are stuck.
    coverage: Array.from(coursesByProgram.entries())
      .map(([programId, courseIds]) => {
        const live = courseIds.filter((id) => publishedCourseIds.has(id));
        return {
          programId,
          programme: programName.get(programId) ?? 'Unknown programme',
          courseCount: courseIds.length,
          publishedCount: live.length,
          publishedCourses: live.map((id) => courseTitle.get(id) ?? 'Untitled course'),
        };
      })
      .sort((a, b) => b.publishedCount - a.publishedCount || a.programme.localeCompare(b.programme)),
    resolving: resolved,
    jobs,
    generatedAt: new Date().toISOString(),
  });
}
