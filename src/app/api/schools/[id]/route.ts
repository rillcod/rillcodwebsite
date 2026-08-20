import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await supabase
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// GET /api/schools/[id] — fetch single school
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await context.params;
  const { data, error } = await adminClient()
    .from('schools')
    .select('*, teacher_schools(id, teacher_id, portal_users!teacher_schools_teacher_id_fkey(id, full_name, email))')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// PATCH /api/schools/[id] — update school fields or status
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();

  // Extract updatable fields — action: 'status' | 'details' | 'assign_teacher' | 'remove_teacher'
  const { action, ...rest } = body;

  if (action === 'assign_teacher') {
    const { teacher_id } = rest;
    if (!teacher_id) return NextResponse.json({ error: 'teacher_id required' }, { status: 400 });
    const { data, error } = await adminClient()
      .from('teacher_schools')
      .insert({ teacher_id, school_id: id, assigned_by: caller.id })
      .select('*, portal_users!teacher_schools_teacher_id_fkey(id, full_name, email)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === 'restore') {
    const { data, error } = await adminClient()
      .from('schools')
      .update({ is_deleted: false, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, restored: true });
  }

  if (action === 'remove_teacher') {
    const { assignment_id } = rest;
    if (!assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 });
    const { error } = await adminClient()
      .from('teacher_schools')
      .delete()
      .eq('id', assignment_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Default: update school row fields (status, name, contact, etc.)
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  const allowed = ['name', 'status', 'school_type', 'contact_person', 'address', 'lga', 'city',
    'state', 'phone', 'email', 'student_count', 'program_interest', 'enrollment_types', 'is_active',
    'programme_standing', 'sessions_per_week', 'exam_capture', 'test_capture'];
  for (const key of allowed) {
    if (rest[key] !== undefined) update[key] = rest[key];
  }
  if (update.programme_standing !== undefined) {
    update.programme_standing = update.programme_standing === 'compulsory' ? 'compulsory' : 'optional';
  }
  if (update.sessions_per_week !== undefined) {
    update.sessions_per_week = Number(update.sessions_per_week) === 1 ? 1 : 2;
  }
  if (update.exam_capture !== undefined) {
    update.exam_capture = update.exam_capture === 'cbt' ? 'cbt' : 'physical';
  }
  if (update.test_capture !== undefined) {
    update.test_capture = update.test_capture === 'cbt' ? 'cbt' : 'physical';
  }

  const { data, error } = await adminClient()
    .from('schools')
    .update(update)
    .eq('id', id)
    .select('*, portal_users!portal_users_school_id_fkey(id, email, full_name), teacher_schools(id, teacher_id, portal_users!teacher_schools_teacher_id_fkey(id, full_name, email))')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/schools/[id] — archive (soft-delete)
// Non-destructive on purpose: a school is the root of ~55 related tables (students,
// finance, reports, live sessions…). A hard delete either violates FK constraints or
// cascades away records you may still need (e.g. settlements). Archiving flips the
// `is_deleted` flag the school lists already respect — the school disappears from every
// picker, all data is preserved, and it can be restored by clearing the flag.
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireAdmin();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  const { error } = await admin
    .from('schools')
    .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, archived: true });
}
