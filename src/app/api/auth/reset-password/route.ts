import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/auth/reset-password
// Body: { userId: string, newPassword: string }
// Admin: can reset any user's password.
// Teacher: can reset passwords for students at their own school only.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();

    // Use adminClient to bypass RLS on portal_users
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId and newPassword are required' }, { status: 400 });
    }
    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Fetch the target user's profile for boundary checks
    const { data: targetUser } = await admin
      .from('portal_users')
      .select('role, school_id')
      .eq('id', userId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Non-admin: campus + role restrictions
    if (caller.role !== 'admin') {
      if (!targetUser.school_id) {
        return NextResponse.json({ error: 'Cannot reset password for a user with no school assignment' }, { status: 403 });
      }
      if (caller.role === 'teacher') {
        if (targetUser.role !== 'student') {
          return NextResponse.json({ error: 'Teachers can only reset student passwords' }, { status: 403 });
        }
        const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
        const allowed = await getTeacherSchoolIds(caller.id, caller.school_id);
        if (!allowed.includes(targetUser.school_id)) {
          return NextResponse.json(
            { error: 'You can only reset passwords for students at your assigned school(s)' },
            { status: 403 },
          );
        }
      } else if (caller.role === 'school') {
        if (['admin', 'teacher', 'school'].includes(targetUser.role)) {
          return NextResponse.json({ error: 'School accounts can only reset student/parent passwords' }, { status: 403 });
        }
        if (targetUser.school_id !== caller.school_id) {
          return NextResponse.json(
            { error: 'You can only reset passwords for users at your school' },
            { status: 403 },
          );
        }
      }
    }

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
