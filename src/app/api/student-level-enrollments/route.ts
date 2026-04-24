import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { MidTermPlacement } from '@/types/progression.types';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

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
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

// ── GET /api/student-level-enrollments ───────────────────────────────────────
// Query params: school_id, course_id, program_id, cohort_year, status, student_id
export async function GET(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const db = adminClient();

  let query = db
    .from('student_level_enrollments')
    .select(`
      *,
      portal_users!student_id ( id, full_name, email ),
      courses!course_id (
        id, title, level_order, next_course_id,
        programs!program_id ( name, delivery_type )
      ),
      promoted_course:courses!promoted_to ( id, title, level_order )
    `)
    .order('cohort_year', { ascending: false })
    .order('created_at', { ascending: false });

  // Scope school role to their school only, and validate teacher scope
  let scopeSchoolId = searchParams.get('school_id');
  
  if (caller.role === 'school') {
    scopeSchoolId = caller.school_id;
  } else if (caller.role === 'teacher') {
    const sids = await getTeacherSchoolIds(caller.id, caller.school_id);
    if (scopeSchoolId) {
      if (!sids.includes(scopeSchoolId)) {
        return NextResponse.json({ error: 'Access denied to this school' }, { status: 403 });
      }
    } else if (sids.length > 0) {
      // If no school_id provided, default to all their assigned schools
      query = query.in('school_id', sids) as any;
    }
  }

  if (scopeSchoolId) query = query.eq('school_id', scopeSchoolId) as any;

  const courseId = searchParams.get('course_id');
  const programId = searchParams.get('program_id');
  const studentId = searchParams.get('student_id');
  const status = searchParams.get('status');
  const cohortYear = searchParams.get('cohort_year');

  if (courseId) query = query.eq('course_id', courseId) as any;
  if (programId) query = query.eq('program_id', programId) as any;
  if (studentId) query = query.eq('student_id', studentId) as any;
  if (status) query = query.eq('status', status) as any;
  if (cohortYear) query = query.eq('cohort_year', parseInt(cohortYear)) as any;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// ── POST /api/student-level-enrollments ──────────────────────────────────────
// Enroll a student at a specific level (handles mid-term placement too)
export async function POST(req: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.role === 'school') {
    return NextResponse.json({ error: 'Only admin and teacher can enroll students' }, { status: 403 });
  }

  const body: MidTermPlacement = await req.json();
  const { student_id, course_id, school_id, program_id, cohort_year, term_label, start_week, module_name } = body;

  if (!student_id || !course_id || !term_label) {
    return NextResponse.json({ error: 'student_id, course_id and term_label are required' }, { status: 400 });
  }

  if (caller.role === 'teacher' && school_id) {
    const sids = await getTeacherSchoolIds(caller.id, caller.school_id);
    if (!sids.includes(school_id)) {
      return NextResponse.json({ error: 'Access denied: You are not assigned to this school' }, { status: 403 });
    }
  }

  const db = adminClient();

  // Check for existing active enrollment at same course+term
  const { data: existing } = await db
    .from('student_level_enrollments')
    .select('id, status')
    .eq('student_id', student_id)
    .eq('course_id', course_id)
    .eq('term_label', term_label)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'Student already has an active enrollment at this level for this term' },
      { status: 409 }
    );
  }

  const { data, error } = await db
    .from('student_level_enrollments')
    .insert({
      student_id,
      course_id,
      school_id: school_id ?? null,
      program_id: program_id ?? null,
      cohort_year: cohort_year ?? new Date().getFullYear(),
      term_label,
      start_week: start_week ?? 1,
      module_name: module_name ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
