import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
  // Must use adminClient to bypass RLS — supabase (anon/user client) may not
  // have read access to portal_users depending on RLS policies.
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

/**
 * Returns true if the caller has staff access to the school a class belongs to.
 * Used for both PATCH and DELETE to centralise the boundary check.
 */
async function callerCanAccessClass(
  caller: Caller,
  classSchoolId: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) return true; // no school restriction on the class

  if (caller.school_id === classSchoolId) return true;

  if (caller.role === 'teacher') {
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }

  return false; // school role but wrong school
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/class-sessions/[id] — update session fields
// Caller must have staff access to the class's school.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch session + its class school for boundary check
  const { data: session } = await admin
    .from('class_sessions')
    .select('id, class_id, classes(school_id)')
    .eq('id', id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const classSchoolId: string | null = (session as any).classes?.school_id ?? null;
  const canAccess = await callerCanAccessClass(caller, classSchoolId);
  if (!canAccess) {
    return NextResponse.json(
      { error: 'Access denied: this session belongs to a class outside your school scope' },
      { status: 403 },
    );
  }

  const body = await request.json();

  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields = ['session_date', 'topic', 'start_time', 'end_time'];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  const { data, error } = await admin
    .from('class_sessions')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/class-sessions/[id] — delete a session
// Caller must have staff access to the class's school.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch session + its class school for boundary check
  const { data: session } = await admin
    .from('class_sessions')
    .select('id, class_id, classes(school_id)')
    .eq('id', id)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const classSchoolId: string | null = (session as any).classes?.school_id ?? null;
  const canAccess = await callerCanAccessClass(caller, classSchoolId);
  if (!canAccess) {
    return NextResponse.json(
      { error: 'Access denied: this session belongs to a class outside your school scope' },
      { status: 403 },
    );
  }

  const { error } = await admin.from('class_sessions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
