import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/auth/reset-password
// Body: { userId: string, newPassword: string }
// Admin only — sets a new password for any portal user directly (no email needed)
export async function POST(req: NextRequest) {
  try {
    // Verify the caller is an admin
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerData } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    const caller = callerData as { role: string } | null;

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId and newPassword are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
