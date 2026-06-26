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
        const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
        const filters = [`created_by.eq.${caller.id}`];
        if (scopedIds.length > 0) filters.push(`school_id.in.(${scopedIds.join(',')})`);
        query = query.or(filters.join(',')) as any;
      } else if (caller.role === 'school') {
        if (caller.school_id) {
          query = query.eq('school_id', caller.school_id) as any;
        } else {
          return NextResponse.json({ data: [] });
        }
      }

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [] });
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

    const data = (rawExams ?? []).filter((exam) =>
      cbtExamVisibleToStudent(exam, student, scope),
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
        .select('id, school_id')
        .eq('id', examFields.class_id)
        .maybeSingle();
      if (clsErr) return NextResponse.json({ error: clsErr.message }, { status: 500 });
      if (!cls) return NextResponse.json({ error: 'Selected class was not found.' }, { status: 400 });
      classSchoolId = cls.school_id ?? null;
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
      'start_date', 'end_date', 'metadata',
    ];
    for (const f of allowedExamFields) {
      if (f in examFields) examPayload[f] = examFields[f] ?? null;
    }

    // exam_type is stored in metadata (no cbt_exams.exam_type column).
    const examType = typeof examFields.exam_type === 'string' ? examFields.exam_type : null;
    const baseMeta = (examPayload.metadata && typeof examPayload.metadata === 'object')
      ? { ...(examPayload.metadata as Record<string, unknown>) }
      : {};
    if (examType) baseMeta.exam_type = examType;
    if (examFields.class_id) {
      baseMeta.target_class_id = examFields.class_id;
      baseMeta.visibility = 'class';
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
