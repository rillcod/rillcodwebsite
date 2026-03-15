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
  const { data: caller } = await adminClient()
    .from('portal_users').select('role, id').eq('id', user.id).single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// POST /api/teacher-schools
// Body: { teacher_id, school_id }
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { teacher_id, school_id } = await request.json();
    if (!teacher_id || !school_id) {
      return NextResponse.json({ error: 'teacher_id and school_id required' }, { status: 400 });
    }

    const { data, error } = await adminClient()
      .from('teacher_schools')
      .insert({ teacher_id, school_id, assigned_by: caller.id })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// DELETE /api/teacher-schools
// Body: { id }  (the teacher_schools row id)
export async function DELETE(request: NextRequest) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await adminClient()
      .from('teacher_schools')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
