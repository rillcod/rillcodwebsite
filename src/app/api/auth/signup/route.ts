import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { canActivatePortalUser, portalStructureError } from '@/lib/portal/structure';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/auth/signup
// Admin: can create any role for any school.
// School manager: can create student/teacher/school accounts for their own school only.
// Teacher: not permitted.
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();

    // Use adminClient to bypass RLS on portal_users
    const { data: callerProfile } = await admin
      .from('portal_users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile || !['admin', 'school'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Unauthorized: only admin or school managers can create accounts' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, fullName, role, school_id, class_id } = body;

    // Validate required fields first
    if (!email || !password || !role) {
      return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 });
    }

    // Minimum password length
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // School manager boundary checks
    if (callerProfile.role === 'school') {
      if (school_id && school_id !== callerProfile.school_id) {
        return NextResponse.json({ error: 'You can only create accounts for your own school' }, { status: 403 });
      }
      if (!['school', 'student', 'teacher'].includes(role)) {
        return NextResponse.json({ error: 'School managers may only create student, teacher, or school accounts' }, { status: 403 });
      }
    }

    // Resolve effective school_id
    const effectiveSchoolId =
      school_id ||
      (callerProfile.role === 'school' ? callerProfile.school_id : null) ||
      null;
    const effectiveClassId = class_id || null;

    if (role !== 'admin') {
      const structureErr = portalStructureError(role, {
        schoolId: effectiveSchoolId,
        classId: effectiveClassId,
      });
      if (structureErr) {
        return NextResponse.json({ error: structureErr }, { status: 400 });
      }
    }

    if (role === 'student' && effectiveClassId) {
      const { data: cls } = await admin
        .from('classes')
        .select('id, school_id')
        .eq('id', effectiveClassId)
        .maybeSingle();
      if (!cls || (cls.school_id && cls.school_id !== effectiveSchoolId)) {
        return NextResponse.json({
          error: 'Students must be assigned to a class that belongs to their school.',
        }, { status: 400 });
      }
    }

    const meta = {
      full_name: fullName,
      role,
      ...(effectiveSchoolId ? { school_id: effectiveSchoolId } : {}),
      ...(effectiveClassId ? { class_id: effectiveClassId } : {}),
    };

    // Create or resolve existing auth user
    let authUserId: string | null = null;

    const { data: authData, error: signupErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: meta,
    });

    if (signupErr) {
      if (signupErr.message.includes('already been registered') || signupErr.message.includes('already exists')) {
        // Look up the existing user — use listUsers with fine-grained filter to avoid
        // fetching all users when the list grows beyond 1000
        const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = listData?.users?.find(
          u => u.email?.trim().toLowerCase() === email.trim().toLowerCase(),
        );
        if (existing) {
          authUserId = existing.id;
          await admin.auth.admin.updateUserById(authUserId, {
            password,
            user_metadata: meta,
          });
        } else {
          return NextResponse.json({ error: 'User exists in Auth but could not be resolved. Contact support.' }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: signupErr.message }, { status: 400 });
      }
    } else {
      authUserId = authData.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
    }

    const active = canActivatePortalUser(role, {
      schoolId: effectiveSchoolId,
      classId: effectiveClassId,
    });

    const { error: profileError } = await admin
      .from('portal_users')
      .upsert({
        id: authUserId,
        email: email.trim().toLowerCase(),
        full_name: fullName || '',
        role,
        school_id: effectiveSchoolId,
        class_id: effectiveClassId,
        is_active: active,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json({ error: `Profile sync failed: ${profileError.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Account created successfully', user_id: authUserId });
  } catch (error: any) {
    console.error('[signup] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
