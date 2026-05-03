import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
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
          query = query.or(`school_id.eq.${caller.school_id},school_id.is.null`) as any;
        } else {
          query = query.is('school_id', null);
        }
      }

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [] });
    }

    // ── Student: active exams within date window, scoped to their programs ──
    const { data: enrollments } = await admin
      .from('enrollments')
      .select('program_id')
      .eq('user_id', caller.id)
      .in('status', ['active', 'enrolled', 'approved']);
    const programIds = (enrollments ?? []).map((e: any) => e.program_id).filter(Boolean) as string[];

    const now = new Date().toISOString();
    let examQuery = admin
      .from('cbt_exams')
      .select('id, title, description, duration_minutes, passing_score, total_questions, start_date, end_date, program_id, course_id, programs(name), courses(title)')
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('start_date');

    if (programIds.length > 0) {
      // Exams linked to their programs OR global exams (no program restriction)
      examQuery = examQuery.or(
        `program_id.in.(${programIds.join(',')}),program_id.is.null`,
      ) as any;
    } else {
      // No enrollments — only global exams
      examQuery = examQuery.is('program_id', null) as any;
    }

    const { data, error } = await examQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
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

    const examPayload: Record<string, unknown> = {
      created_by: caller.id,
      created_at: new Date().toISOString(),
    };

    const allowedExamFields = [
      'title', 'description', 'program_id', 'course_id', 'exam_type',
      'duration_minutes', 'passing_score', 'total_questions', 'is_active',
      'start_date', 'end_date', 'metadata',
    ];
    for (const f of allowedExamFields) {
      if (f in examFields) examPayload[f] = examFields[f] ?? null;
    }

    const admin = adminClient();

    // school_id: validate teacher is assigned to the school
    const requestedSchoolId: string | null = typeof examFields.school_id === 'string' ? examFields.school_id : null;
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
      } else if (caller.school_id) {
        examPayload.school_id = caller.school_id;
      }
    } else {
      // admin: trust the provided school_id as-is
      if ('school_id' in examFields) examPayload.school_id = examFields.school_id ?? null;
    }

    // Always try to attach school_name if school_id is present (safe multi-tenancy)
    if (examPayload.school_id) {
      const { data: s } = await admin.from('schools').select('name').eq('id', examPayload.school_id).single();
      if (s?.name) examPayload.school_name = s.name;
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
