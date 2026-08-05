import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import {
  cbtExamVisibleToStudent,
  loadCbtStudentProfile,
  resolveStudentCbtScope,
} from '@/lib/cbt/visibility';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  return (caller as Caller) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cbt/exams — list exams visible to current user
//   admin:   all exams
//   teacher: exams they created OR scoped to their assigned school(s)
//   school:  exams scoped to their school
//   student: active exams scoped to their enrolled programs (no correct_answer)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(_request: NextRequest) {
  try {
    const { searchParams } = new URL(_request.url);
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);

    if (isStaff) {
      let query = admin
        .from('cbt_exams')
        .select('*, programs(name), courses(title), cbt_sessions(id, score, status)')
        .order('created_at', { ascending: false });

      if (caller.role === 'admin') {
        // Platform admins see all, but can filter by school_id if passed
        const filterSid = searchParams.get('school_id');
        if (filterSid) query = query.eq('school_id', filterSid) as any;
      } else if (caller.role === 'teacher') {
        query = query.eq('created_by', caller.id) as any;
      } else if (caller.role === 'school') {
        if (caller.school_id) {
          query = query.eq('school_id', caller.school_id) as any;
        } else {
          return NextResponse.json({ data: [] });
        }
      }

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Default: live academic session. Pass all_sessions=1 for history.
      const allSessions = searchParams.get('all_sessions') === '1';
      if (allSessions) return NextResponse.json({ data: data ?? [] });

      const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds, filterCbtExamsByAcademicTerm } = await import('@/lib/cbt/session');
      const liveTermId = searchParams.get('term_id') || await resolveAssignmentTermId(admin as any, {});
      const bounds = await loadAcademicTermBounds(admin as any, liveTermId);
      const scoped = filterCbtExamsByAcademicTerm((data ?? []) as any[], liveTermId, bounds, {
        includeUntagged: true,
      });
      return NextResponse.json({ data: scoped });
    }

    // ── Student: active exams within date window, scoped by class + programme ──
    const student = await loadCbtStudentProfile(admin, caller.id);
    if (!student) return NextResponse.json({ data: [] });

    const scope = await resolveStudentCbtScope(admin, caller.id, student.class_id);
    const now = new Date().toISOString();
    let examQuery = admin
      .from('cbt_exams')
      .select('id, title, description, duration_minutes, passing_score, total_questions, is_active, start_date, end_date, program_id, course_id, school_id, metadata, programs(name), courses(title)')
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('start_date');

    // School students only see exams explicitly tied to their school.
    if (student.school_id) {
      examQuery = examQuery.eq('school_id', student.school_id) as typeof examQuery;
    } else {
      examQuery = examQuery.is('school_id', null) as typeof examQuery;
    }

    const { data: rawExams, error } = await examQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
    const { loadAcademicTermBounds, filterCbtExamsByAcademicTerm } = await import('@/lib/cbt/session');
    const liveTermId = await resolveAssignmentTermId(admin as any, {
      classId: student.class_id ?? null,
    });
    const bounds = await loadAcademicTermBounds(admin as any, liveTermId);
    const data = filterCbtExamsByAcademicTerm(
      ((rawExams ?? []) as any[]).filter((exam) => cbtExamVisibleToStudent(exam, student, scope)),
      liveTermId,
      bounds,
      { includeUntagged: true },
    );
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/cbt/exams — create exam + questions atomically
// admin: full control; teacher: school_id validated against their assignments
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const body = await request.json();
    const { questions = [], ...examFields } = body;
    const admin = adminClient();
    let classSchoolId: string | null = null;
    let classScoped = false;

    if (examFields.class_id) {
      classScoped = true;
      const { data: cls, error: clsErr } = await admin
        .from('classes')
        .select('id, school_id, teacher_id, program_id, term_id')
        .eq('id', examFields.class_id)
        .maybeSingle();
      if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });
      if (!cls) return NextResponse.json({ error: 'Selected class was not found.' }, { status: 400 });
      classSchoolId = cls.school_id ?? null;
      if (caller.role === 'teacher' && cls.teacher_id !== caller.id) {
        return NextResponse.json({ error: 'You can only create evaluations for your assigned class.' }, { status: 403 });
      }
    }

    const canonicalPlanId = typeof examFields.lesson_plan_id === 'string' ? examFields.lesson_plan_id : null;
    if (canonicalPlanId) {
      if (!examFields.class_id) {
        return NextResponse.json({ error: 'class_id is required with lesson_plan_id' }, { status: 400 });
      }
      const { data: plan } = await admin.from('lesson_plans')
        .select('id,class_id,course_id,term_id,school_id,status')
        .eq('id', canonicalPlanId).maybeSingle();
      if (!plan || plan.status === 'archived' || plan.class_id !== examFields.class_id) {
        return NextResponse.json({ error: 'Active class lesson plan not found' }, { status: 400 });
      }
      if (examFields.course_id && examFields.course_id !== plan.course_id) {
        return NextResponse.json({ error: 'Course does not match the class lesson plan' }, { status: 400 });
      }
      if (examFields.lesson_id) {
        const { data: lesson } = await (admin as any).from('lessons')
          .select('id,class_id,lesson_plan_id').eq('id', examFields.lesson_id).maybeSingle();
        if (!lesson || lesson.class_id !== plan.class_id || lesson.lesson_plan_id !== plan.id) {
          return NextResponse.json({ error: 'Lesson does not belong to the class lesson plan' }, { status: 400 });
        }
      }
      examFields.class_id = plan.class_id;
      examFields.course_id = plan.course_id;
      examFields.term_id = plan.term_id;
      examFields.school_id = plan.school_id;
      classSchoolId = plan.school_id;
    }

    if (examFields.start_date && examFields.end_date) {
      const startMs = new Date(examFields.start_date).getTime();
      const endMs = new Date(examFields.end_date).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return NextResponse.json(
          { error: 'Exam close time must be after the scheduled start time.' },
          { status: 400 },
        );
      }
    }

    const examPayload: Record<string, unknown> = {
      created_by: caller.id,
      created_at: new Date().toISOString(),
    };

    const allowedExamFields = [
      'title', 'description', 'program_id', 'course_id',
      'duration_minutes', 'passing_score', 'total_questions', 'is_active',
      'start_date', 'end_date', 'metadata', 'class_id', 'lesson_plan_id',
      'lesson_id', 'curriculum_week_number', 'term_id',
    ];
    for (const f of allowedExamFields) {
      if (f in examFields) examPayload[f] = examFields[f] ?? null;
    }

    // exam_type is stored in metadata (no cbt_exams.exam_type column).
    // Stamp academic session (year+term) so dashboards/GPA don't mix historic CBT.
    const examType = typeof examFields.exam_type === 'string' ? examFields.exam_type : null;
    const baseMeta = (examPayload.metadata && typeof examPayload.metadata === 'object')
      ? { ...(examPayload.metadata as Record<string, unknown>) }
      : {};
    if (examType) baseMeta.exam_type = examType;
    if (canonicalPlanId) baseMeta.lesson_plan_id = canonicalPlanId;
    if (examFields.lesson_id) baseMeta.lesson_id = examFields.lesson_id;
    if (examFields.curriculum_week_number) baseMeta.week = examFields.curriculum_week_number;
    if (examFields.class_id) {
      baseMeta.target_class_id = examFields.class_id;
      baseMeta.visibility = 'class';
    }
    if (!baseMeta.term_id) {
      const { resolveAssignmentTermId, loadTeachingPeriodFromClass } = await import('@/lib/assignments/session');
      const classId =
        typeof examFields.class_id === 'string' ? examFields.class_id : null;
      const period = await loadTeachingPeriodFromClass(admin as any, classId, {
        class_id: classId,
        academic_offering_id:
          typeof examFields.academic_offering_id === 'string'
            ? examFields.academic_offering_id
            : null,
        offering_period_id:
          typeof examFields.offering_period_id === 'string'
            ? examFields.offering_period_id
            : null,
      });
      const termId = await resolveAssignmentTermId(admin as any, {
        termId: typeof examFields.term_id === 'string' ? examFields.term_id : null,
        classId,
        period,
      });
      if (termId) {
        baseMeta.term_id = termId;
        examPayload.term_id = termId;
      }
    } else {
      examPayload.term_id = baseMeta.term_id;
    }
    if (Object.keys(baseMeta).length > 0) examPayload.metadata = baseMeta;

    // school_id: validate teacher is assigned to the school
    const requestedSchoolId: string | null = classSchoolId ?? (typeof examFields.school_id === 'string' ? examFields.school_id : null);
    if (caller.role === 'teacher') {
      if (requestedSchoolId) {
        const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this exam.' },
            { status: 403 },
          );
        }
        examPayload.school_id = requestedSchoolId;
      } else if (!classScoped && caller.school_id) {
        examPayload.school_id = caller.school_id;
      } else {
        return NextResponse.json(
          { error: 'Select one of your assigned schools for this exam.' },
          { status: 400 },
        );
      }
    } else {
      // admin: trust the provided school_id as-is
      if (classScoped) examPayload.school_id = classSchoolId;
      else if ('school_id' in examFields) examPayload.school_id = examFields.school_id ?? null;
    }

    if (!examPayload.title) {
      return NextResponse.json({ error: 'Exam title is required' }, { status: 400 });
    }

    const { data: exam, error: examErr } = await admin
      .from('cbt_exams')
      .insert(examPayload)
      .select('id')
      .single();

    if (examErr) return NextResponse.json({ error: examErr.message }, { status: 500 });

    if (questions.length > 0) {
      const qPayloads = questions.map((q: any, i: number) => ({
        exam_id: exam.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options ?? null,
        correct_answer: q.correct_answer,
        points: q.points ?? 5,
        order_index: i + 1,
        metadata: { ...(q.metadata ?? {}), ...(q.section ? { section: q.section } : {}) },
      }));
      const { error: qErr } = await admin.from('cbt_questions').insert(qPayloads);
      if (qErr) {
        await admin.from('cbt_exams').delete().eq('id', exam.id); // roll back
        return NextResponse.json({ error: qErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ data: exam }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
