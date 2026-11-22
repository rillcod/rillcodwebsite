import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';

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

    if (!caller || !roleHasCapability(caller.role, 'reset_scoped_passwords')) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { userId, newPassword } = await req.json();
    const cleanPassword = String(newPassword ?? '').trim();

    if (!userId || !cleanPassword) {
      return NextResponse.json({ error: 'userId and newPassword are required' }, { status: 400 });
    }
    if (cleanPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Fetch the target user's profile for boundary checks & credential archive sync
    const { data: targetUser } = await admin
      .from('portal_users')
      .select('role, school_id, school_name, email, full_name, section_class')
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

    const cleanTargetEmail = String((targetUser as any).email ?? '').trim().toLowerCase();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: cleanPassword,
      email_confirm: true,
      ban_duration: 'none',
      ...(cleanTargetEmail ? { email: cleanTargetEmail } : {}),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Ensure the portal profile is active and the printed credentials vault matches the exact new password
    if (targetUser.role === 'student') {
      await admin
        .from('portal_users')
        .update({ is_active: true, ...(cleanTargetEmail ? { email: cleanTargetEmail } : {}) })
        .eq('id', userId);
      if (cleanTargetEmail) {
        await archivePortalCredential(admin as any, {
          schoolId: targetUser.school_id ?? null,
          schoolName: (targetUser as any).school_name ?? null,
          fullName: (targetUser as any).full_name || 'Student',
          email: cleanTargetEmail,
          password: cleanPassword,
          className: (targetUser as any).section_class ?? null,
          batchLabel: 'Password Reset',
        });
      }
    }
    await logAudit(admin as any, {
      action: 'reset_user_password',
      actorId: caller.id,
      resourceType: 'portal_user',
      resourceId: userId,
      tableName: 'portal_users',
      newValues: {
        target_role: targetUser.role,
        target_school_id: targetUser.school_id,
        password_changed: true,
      },
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
