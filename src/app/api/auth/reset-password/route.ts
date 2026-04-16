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

    // Non-admin: cannot reset passwords for other staff or admin accounts
    if (caller.role !== 'admin') {
      if (['admin'].includes(targetUser.role)) {
        return NextResponse.json({ error: 'You cannot reset an admin\'s password' }, { status: 403 });
      }
      // Teacher and school roles can only reset passwords for users at their own school
      if (caller.role === 'school' && ['teacher', 'school'].includes(targetUser.role)) {
        return NextResponse.json({ error: 'School accounts can only reset student passwords' }, { status: 403 });
      }
      if (targetUser.school_id && targetUser.school_id !== caller.school_id) {
        // Check teacher_schools for multi-school teachers
        if (caller.role === 'teacher') {
          const { data: ts } = await admin
            .from('teacher_schools')
            .select('school_id')
            .eq('teacher_id', caller.id)
            .eq('school_id', targetUser.school_id)
            .maybeSingle();
          if (!ts) {
            return NextResponse.json(
              { error: 'You can only reset passwords for users at your assigned school(s)' },
              { status: 403 },
            );
          }
        } else {
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
