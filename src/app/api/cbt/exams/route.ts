import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  return caller ?? null;
}

// GET /api/cbt/exams — list exams visible to current user (bypasses RLS)
export async function GET(_request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const isStaff = ['admin', 'teacher', 'school'].includes(caller.role);

    if (isStaff) {
      let query = admin
        .from('cbt_exams')
        .select('*, programs(name), courses(title), cbt_sessions(id, score, status)')
        .order('created_at', { ascending: false });

      if (caller.role === 'teacher') {
        // Scope to exams created by this teacher (created_by) OR linked to their school
        const orFilter = caller.school_id
          ? `created_by.eq.${caller.id},school_id.eq.${caller.school_id}`
          : `created_by.eq.${caller.id}`;
        query = query.or(orFilter) as any;
      }

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [] });
    } else {
      // Student: active exams scoped to their enrolled programs
      // 1. Get student's enrolled program IDs
      const { data: enrollments } = await admin
        .from('enrollments')
        .select('program_id')
        .eq('user_id', caller.id);
      const programIds = (enrollments ?? []).map((e: any) => e.program_id).filter(Boolean);

      let examQuery = admin
        .from('cbt_exams')
        .select('*, programs(name), courses(title)')
        .eq('is_active', true)
        .order('start_date');

      // If student has enrolled programs, scope to those; otherwise return empty
      if (programIds.length > 0) {
        examQuery = examQuery.or(
          `program_id.in.(${programIds.join(',')}),program_id.is.null`
        ) as any;
      } else {
        // No enrollments — only show exams not tied to any specific program
        examQuery = examQuery.is('program_id', null) as any;
      }

      const { data, error } = await examQuery;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: data ?? [] });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/cbt/exams — create exam + questions atomically (bypasses RLS)
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
    const allowedExamFields = ['title', 'description', 'program_id', 'course_id',
      'duration_minutes', 'passing_score', 'total_questions', 'is_active',
      'start_date', 'end_date', 'school_id', 'metadata'];
    for (const f of allowedExamFields) {
      if (f in examFields) examPayload[f] = examFields[f] ?? null;
    }

    const admin = adminClient();
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
        // Roll back exam
        await admin.from('cbt_exams').delete().eq('id', exam.id);
        return NextResponse.json({ error: qErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ data: exam }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
