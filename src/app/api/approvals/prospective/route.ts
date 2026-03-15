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
    .from('portal_users').select('role, id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

// POST /api/approvals/prospective
// Body: { id: string; action: 'approved' | 'rejected' }
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id, action } = await request.json();
    if (!id || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'id and action required' }, { status: 400 });
    }

    const update = action === 'rejected'
      ? { is_deleted: true, is_active: false }
      : { is_active: true };

    const { error } = await adminClient()
      .from('prospective_students')
      .update(update)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
