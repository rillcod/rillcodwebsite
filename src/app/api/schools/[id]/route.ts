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
    .select('*, teacher_schools(id, teacher_id, portal_users:teacher_id(id, full_name, email))')
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
      .select('*, portal_users:teacher_id(id, full_name, email)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
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
    'state', 'phone', 'email', 'student_count', 'program_interest', 'enrollment_types', 'is_active'];
  for (const key of allowed) {
    if (rest[key] !== undefined) update[key] = rest[key];
  }

  const { data, error } = await adminClient()
    .from('schools')
    .update(update)
    .eq('id', id)
    .select('*, portal_users(id, email, full_name), teacher_schools(id, teacher_id, portal_users:teacher_id(id, full_name, email))')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/schools/[id] — force delete
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

  // 1. Delete teacher assignments
  await admin.from('teacher_schools').delete().eq('school_id', id);

  // 2. Find and delete all portal_users + their auth accounts
  const { data: portalUsers } = await admin.from('portal_users').select('id').eq('school_id', id);
  if (portalUsers && portalUsers.length > 0) {
    for (const pu of portalUsers) {
      // Delete from Auth (this also triggers any profile cleanup if there are triggers, 
      // but we explicitly delete from portal_users too for safety)
      await admin.auth.admin.deleteUser(pu.id);
      await admin.from('portal_users').delete().eq('id', pu.id);
    }
  }

  // 3. Unlink students (don't delete them, just remove the school link)
  await admin.from('students').update({ school_id: null, school_name: null }).eq('school_id', id);

  // 4. Hard delete the school row itself
  const { error } = await admin.from('schools').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
