import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

/**
 * Returns true when the caller can manage (write/delete) the given class.
 * - admin:  always
 * - teacher: assigned to the class's school via teacher_schools OR primary school_id
 * - school:  class belongs to their school
 */
async function callerCanManageClass(caller: Caller, classSchoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) {
    // Class has no school — only admin can manage it
    return caller.role === 'admin';
  }
  if (caller.role === 'school') {
    return caller.school_id === classSchoolId;
  }
  if (caller.role === 'teacher') {
    if (caller.school_id === classSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes/[id]
// Fetch a single class with related data.
// Access: admin (any), teacher (any in their school(s)), school (own school only)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch the class first so we can do a pre-query school check
  const { data, error } = await admin
    .from('classes')
    .select('*, programs(id, name, difficulty_level), portal_users!classes_teacher_id_fkey(id, full_name), schools(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Access guard ──────────────────────────────────────────────────────────
  if (caller.role !== 'admin') {
    const classSchoolId = (data as any).school_id ?? null;
    const canAccess = await callerCanManageClass(caller, classSchoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied: class is outside your school scope' }, { status: 403 });
    }
  }

  return NextResponse.json({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/classes/[id]
// Update class fields. Caller must have school access to the class.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  // school role cannot mutate classes directly (read-only for them)
  if (caller.role === 'school') {
    return NextResponse.json({ error: 'School accounts cannot edit class records directly' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch the class to check school access
  const { data: cls } = await admin
    .from('classes')
    .select('school_id, name')
    .eq('id', id)
    .maybeSingle();

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const canManage = await callerCanManageClass(caller, cls.school_id ?? null);
  if (!canManage) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to' },
      { status: 403 },
    );
  }

  const body = await request.json();

  // ── Field whitelist — current_students excluded (managed by enroll route only) ──
  const allowed: Record<string, unknown> = {};
  const allowedFields = [
    'name', 'description', 'program_id', 'teacher_id',
    'max_students', 'status', 'schedule', 'start_date', 'end_date',
  ];

  // school_id: only admin can reassign a class to a different school
  if (caller.role === 'admin' && 'school_id' in body) {
    allowed.school_id = body.school_id ?? null;
  }

  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  allowed.updated_at = new Date().toISOString();

  // If the class name changed, update section_class on all enrolled students
  const newName: string | null = typeof body.name === 'string' ? body.name : null;
  const nameChanged = newName && newName !== cls.name;

  const { error } = await admin
    .from('classes')
    .update(allowed)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep section_class in sync if name was renamed
  if (nameChanged) {
    await admin
      .from('portal_users')
      .update({ section_class: newName })
      .eq('class_id', id)
      .eq('role', 'student');
  }

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/classes/[id]
// Caller must be admin or a teacher/school assigned to the class's school.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  // school role cannot delete classes
  if (caller.role === 'school') {
    return NextResponse.json({ error: 'School accounts cannot delete class records' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  const { data: cls } = await admin
    .from('classes')
    .select('school_id')
    .eq('id', id)
    .maybeSingle();

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const canManage = await callerCanManageClass(caller, cls.school_id ?? null);
  if (!canManage) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to' },
      { status: 403 },
    );
  }

  // Clear class_id and section_class on all students in this class before deleting
  await admin
    .from('portal_users')
    .update({ class_id: null, section_class: null })
    .eq('class_id', id)
    .eq('role', 'student');

  const { error } = await admin.from('classes').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
