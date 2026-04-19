import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { PromotionPayload } from '@/types/progression.types';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

// ── PATCH /api/student-level-enrollments/[id] ────────────────────────────────
// Process a promotion decision (promote | repeat | complete | withdraw)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body: PromotionPayload = await req.json();
  const { decision, next_term_label, teacher_notes } = body;

  if (!decision || !next_term_label) {
    return NextResponse.json({ error: 'decision and next_term_label are required' }, { status: 400 });
  }

  const db = adminClient();

  // Load current enrollment + course chain
  const { data: enrollment, error: loadErr } = await db
    .from('student_level_enrollments')
    .select('*, courses!course_id(id, title, level_order, next_course_id, program_id, school_id)')
    .eq('id', id)
    .single();

  if (loadErr || !enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
  }
  if (enrollment.status !== 'active') {
    return NextResponse.json({ error: 'Enrollment is not active' }, { status: 409 });
  }

  const course: any = enrollment.courses;

  // ── Apply decision ────────────────────────────────────────────────────────
  if (decision === 'withdraw') {
    const { error } = await db
      .from('student_level_enrollments')
      .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { decision, enrollment_id: id } });
  }

  if (decision === 'complete') {
    const { error } = await db
      .from('student_level_enrollments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { decision, enrollment_id: id } });
  }

  if (decision === 'repeat') {
    // Close current, open a new enrollment at the same course next term
    await db.from('student_level_enrollments')
      .update({ status: 'repeated', updated_at: new Date().toISOString() })
      .eq('id', id);

    const { data: newEnroll, error } = await db
      .from('student_level_enrollments')
      .insert({
        student_id:  enrollment.student_id,
        course_id:   enrollment.course_id,
        school_id:   enrollment.school_id,
        program_id:  enrollment.program_id,
        cohort_year: enrollment.cohort_year,
        term_label:  next_term_label,
        start_week:  1,
        status:      'active',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { decision, new_enrollment: newEnroll } });
  }

  if (decision === 'promote') {
    const nextCourseId: string | null = course?.next_course_id ?? null;

    // Close current enrollment
    await db.from('student_level_enrollments')
      .update({
        status:       'promoted',
        promoted_to:  nextCourseId,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id);

    if (!nextCourseId) {
      // No next level defined — mark completed instead
      return NextResponse.json({
        data: { decision: 'completed_track', message: 'No next level — student has completed the full track' }
      });
    }

    // Open new enrollment at next level
    const { data: newEnroll, error } = await db
      .from('student_level_enrollments')
      .insert({
        student_id:  enrollment.student_id,
        course_id:   nextCourseId,
        school_id:   enrollment.school_id,
        program_id:  enrollment.program_id,
        cohort_year: enrollment.cohort_year,
        term_label:  next_term_label,
        start_week:  1,
        status:      'active',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: { decision, new_enrollment: newEnroll } });
  }

  return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
}
