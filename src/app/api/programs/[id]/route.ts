import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireSession() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getCallerRole(userId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('portal_users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// GET /api/programs/[id]
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const callerRole = user ? await getCallerRole(user.id) : null;
    const { id } = await context.params;
    const { data, error } = await adminClient()
      .from('programs')
      .select('*, courses ( id, title, is_active )')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    if (!user && !data.is_active) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user && !data.is_active && (!callerRole || !['admin', 'teacher', 'school'].includes(callerRole))) {
      // Logged-in learners should not access inactive/private programs by id.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// PUT /api/programs/[id] — update program
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await context.params;
    const body = await request.json();

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = ['name', 'description', 'duration_weeks', 'difficulty_level', 'price', 'max_students', 'is_active', 'delivery_type'];
    for (const f of fields) {
      if (f in body) allowed[f] = body[f] ?? null;
    }

    const { data, error } = await adminClient()
      .from('programs')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// DELETE /api/programs/[id]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await context.params;
    const { error } = await adminClient()
      .from('programs')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
