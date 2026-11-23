import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import { getSessionBoundary } from '@/lib/academic/session-scope';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const GRADE_LADDER = [
  'Basic 1',
  'Basic 2',
  'Basic 3',
  'Basic 4',
  'Basic 5',
  'Basic 6',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SS 1',
  'SS 2',
  'SS 3',
] as const;

function detectSingleGrade(name: string | null | undefined, gradeLevel: string | null | undefined): string | null {
  const combined = `${String(gradeLevel || '').trim()} ${String(name || '').trim()}`.trim();
  if (!combined) return null;

  // Reject multi-grade range classes (e.g. "Basic 1-3", "JSS 1 & 2", "Primary 4-6")
  if (/\b(?:basic|primary|pry|jss|js|sss|ss|grade)\s*\d+\s*(?:[-–—&/,]|to)\s*\d+/i.test(combined)) {
    return null;
  }

  const ssMatch = combined.match(/\b(?:sss|ss)\s*([1-3])\b/i);
  if (ssMatch) return `SS ${ssMatch[1]}`;

  const jssMatch = combined.match(/\b(?:jss|js)\s*([1-3])\b/i);
  if (jssMatch) return `JSS ${jssMatch[1]}`;

  const basicMatch = combined.match(/\b(?:basic|primary|pry|grade)\s*([1-6])\b/i);
  if (basicMatch) return `Basic ${basicMatch[1]}`;

  return null;
}

type PlanRow = {
  from_class_id: string;
  from_class_name: string;
  from_grade: string;
  to_class_id: string | null;
  to_class_name: string | null;
  to_grade: string | null;
  action: 'promote' | 'archive_graduated' | 'no_target_class';
  student_count: number;
};

/**
 * POST /api/admin/schools/[id]/rollover
 * { dry_run?: boolean } (defaults to true)
 *
 * Admin-only top-down school-wide session rollover:
 *   SS 3 → archive_graduated
 *   SS 2 → SS 3, SS 1 → SS 2, JSS 3 → SS 1, ..., Basic 1 → Basic 2
 * Reuses reinstateStudentToClass so class_term_rosters, portal_users.class_id,
 * students.grade/current_class, and classes.current_students all stay in sync.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: schoolId } = await context.params;
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('id, role, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (caller?.role !== 'admin') {
      return NextResponse.json({ error: 'Administrators only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run !== false;

    const { data: school, error: schoolErr } = await admin
      .from('schools')
      .select('id, name')
      .eq('id', schoolId)
      .maybeSingle();

    if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 });
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

    const { data: classes, error: clsErr } = await admin
      .from('classes')
      .select('id, name, program_id, term_id, school_id, status')
      .eq('school_id', schoolId)
      .order('name');

    if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });

    const activeClasses = (classes ?? []).filter(
      (c: any) => !['archived', 'inactive', 'completed'].includes(String(c.status || '').toLowerCase()),
    );

    // Group single-grade classes by (program_id, grade) so we never cross programmes.
    const classByProgramAndGrade = new Map<string, any>();
    const parsedClasses: Array<{ cls: any; grade: string; ladderIndex: number }> = [];
    const skippedClasses: Array<{ id: string; name: string; reason: string }> = [];

    for (const cls of activeClasses) {
      const grade = detectSingleGrade(cls.name, null);
      if (!grade) {
        skippedClasses.push({
          id: cls.id,
          name: cls.name,
          reason: 'Multi-grade or custom section (promote via Class Intake instead)',
        });
        continue;
      }
      const ladderIndex = GRADE_LADDER.indexOf(grade as (typeof GRADE_LADDER)[number]);
      if (ladderIndex < 0) continue;
      parsedClasses.push({ cls, grade, ladderIndex });
      const key = `${cls.program_id || 'none'}::${grade}`;
      if (!classByProgramAndGrade.has(key)) {
        classByProgramAndGrade.set(key, cls);
      }
    }

    // Sort top-down (SS 3 first, Basic 1 last) so promotions never collide.
    parsedClasses.sort((a, b) => b.ladderIndex - a.ladderIndex);

    const classIds = parsedClasses.map((p) => p.cls.id);
    const studentsByClass = new Map<string, Array<{ id: string; full_name: string | null }>>();

    if (classIds.length > 0) {
      const { data: activeStudents } = await admin
        .from('portal_users')
        .select('id, full_name, class_id')
        .eq('role', 'student')
        .eq('is_active', true)
        .in('class_id', classIds);

      for (const st of activeStudents ?? []) {
        const cid = String(st.class_id || '');
        if (!cid) continue;
        const arr = studentsByClass.get(cid) ?? [];
        arr.push({ id: st.id, full_name: st.full_name });
        studentsByClass.set(cid, arr);
      }
    }

    const plan: PlanRow[] = [];
    for (const item of parsedClasses) {
      const roster = studentsByClass.get(item.cls.id) ?? [];
      if (item.ladderIndex === GRADE_LADDER.length - 1) {
        plan.push({
          from_class_id: item.cls.id,
          from_class_name: item.cls.name,
          from_grade: item.grade,
          to_class_id: null,
          to_class_name: 'Graduated Archive',
          to_grade: 'Graduated',
          action: 'archive_graduated',
          student_count: roster.length,
        });
        continue;
      }

      const nextGrade = GRADE_LADDER[item.ladderIndex + 1];
      const sameProgKey = `${item.cls.program_id || 'none'}::${nextGrade}`;
      const fallbackAnyKey = Array.from(classByProgramAndGrade.keys()).find((k) => k.endsWith(`::${nextGrade}`));
      const targetClass =
        classByProgramAndGrade.get(sameProgKey) ??
        (fallbackAnyKey ? classByProgramAndGrade.get(fallbackAnyKey) : null);

      plan.push({
        from_class_id: item.cls.id,
        from_class_name: item.cls.name,
        from_grade: item.grade,
        to_class_id: targetClass?.id ?? null,
        to_class_name: targetClass?.name ?? null,
        to_grade: nextGrade,
        action: targetClass ? 'promote' : 'no_target_class',
        student_count: roster.length,
      });
    }

    const actionablePlan = plan.filter((p) => p.student_count > 0 && p.action !== 'no_target_class');
    const totalStudentsAffected = actionablePlan.reduce((sum, p) => sum + p.student_count, 0);
    const currentSession = getSessionBoundary().periodLabel;

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        school_id: school.id,
        school_name: school.name,
        current_session: currentSession,
        plan,
        skipped_classes: skippedClasses,
        total_students_affected: totalStudentsAffected,
      });
    }

    let promoted = 0;
    let archived = 0;
    let failed = 0;

    for (const step of actionablePlan) {
      const roster = studentsByClass.get(step.from_class_id) ?? [];
      if (step.action === 'archive_graduated') {
        const studentIds = roster.map((s) => s.id);
        if (studentIds.length > 0) {
          const nowIso = new Date().toISOString();
          await (admin as any)
            .from('class_term_rosters')
            .update({ status: 'withdrawn', ended_at: nowIso, updated_by: caller.id })
            .eq('class_id', step.from_class_id)
            .in('student_id', studentIds);

          const { error: clearErr } = await admin
            .from('portal_users')
            .update({ class_id: null, section_class: `Graduated (${currentSession})` })
            .in('id', studentIds);

          if (clearErr) {
            failed += studentIds.length;
          } else {
            archived += studentIds.length;
          }

          const { data: activeCount } = await (admin as any).rpc('active_class_student_count', {
            p_class_id: step.from_class_id,
          });
          await admin
            .from('classes')
            .update({ current_students: Number(activeCount ?? 0) })
            .eq('id', step.from_class_id);
        }
        continue;
      }

      if (step.action === 'promote' && step.to_class_id) {
        for (const st of roster) {
          const result = await reinstateStudentToClass(admin as any, {
            studentId: st.id,
            classId: step.to_class_id,
            actor: { id: caller.id, role: 'admin' },
            grade: step.to_grade,
            forceCrossTeacher: true,
          });
          if (result.ok) promoted += 1;
          else failed += 1;
        }
      }
    }

    await logAudit(admin as any, {
      actorId: caller.id,
      action: 'school_session_rollover',
      resourceType: 'school',
      resourceId: school.id,
      newValues: {
        school_name: school.name,
        session: currentSession,
        promoted,
        archived,
        failed,
      },
    });

    return NextResponse.json({
      ok: true,
      dry_run: false,
      school_id: school.id,
      school_name: school.name,
      promoted,
      archived,
      failed,
      message: `Rollover complete for ${school.name}: ${promoted} promoted, ${archived} graduated/archived${failed ? `, ${failed} skipped` : ''}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Rollover failed' }, { status: 500 });
  }
}
