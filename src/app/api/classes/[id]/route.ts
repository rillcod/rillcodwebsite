import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller;
}

// GET /api/classes/[id] — fetch single class with related data (bypasses RLS)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await adminClient()
    .from('classes')
    .select('*, programs(id, name, difficulty_level), portal_users!classes_teacher_id_fkey(id, full_name), schools(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// PATCH /api/classes/[id] — update class fields (bypasses RLS)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
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
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  const { error } = await adminClient()
    .from('classes')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
