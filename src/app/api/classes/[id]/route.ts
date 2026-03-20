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
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

async function requireWriteStaff() {
  const caller = await getCaller();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller;
}

async function requireOwnerOrAdmin(classId: string, caller: { role: string; id: string }) {
  if (caller.role === 'admin') return true;
  const { data } = await adminClient()
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id === caller.id;
}

// GET /api/classes/[id] — fetch single class with related data (bypasses RLS)
// admin/teacher: any class; school: only classes belonging to their school
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await adminClient()
    .from('classes')
    .select('*, programs(id, name, difficulty_level), portal_users!classes_teacher_id_fkey(id, full_name), schools(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // School role: can only view classes that belong to their school
  if (caller.role === 'school' && (data as any).school_id !== caller.school_id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  return NextResponse.json({ data });
}

// PATCH /api/classes/[id] — update class fields (bypasses RLS)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireWriteStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  if (!await requireOwnerOrAdmin(id, caller)) {
    return NextResponse.json({ error: 'You can only edit classes you teach' }, { status: 403 });
  }

  const body = await request.json();

  // Whitelist allowed update fields
  const allowed: Record<string, unknown> = {};
  const allowedFields = ['name', 'description', 'program_id', 'teacher_id', 'school_id',
    'max_students', 'current_students', 'status', 'schedule', 'start_date', 'end_date'];
  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await adminClient()
    .from('classes')
    .update(allowed)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/classes/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireWriteStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  if (!await requireOwnerOrAdmin(id, caller)) {
    return NextResponse.json({ error: 'You can only delete classes you teach' }, { status: 403 });
  }

  const admin = adminClient();

  // Nullify class_id on students assigned to this class before deleting
  await admin.from('portal_users').update({ class_id: null } as any).eq('class_id', id);

  const { error } = await admin.from('classes').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
