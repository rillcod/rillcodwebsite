import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';

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
    const { email, password, fullName, role, school_id, class_id, section_class, grade } = body;

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

    let schoolName: string | null = null;
    if (effectiveSchoolId) {
      const { data: sch } = await admin.from('schools').select('name').eq('id', effectiveSchoolId).maybeSingle();
      schoolName = sch?.name ?? null;
    }

    // Auto-place class for students when school is known but class omitted.
    const placed = await preparePortalStructure(admin as any, {
      role,
      schoolId: effectiveSchoolId,
      schoolName,
      classId: class_id || null,
      classHints: [section_class],
      grade: grade ?? null,
      wantActive: true,
      autoCreateClass: role === 'student',
    });

    if (role !== 'admin' && !placed.isActive) {
      return NextResponse.json({
        error: placed.error || 'Cannot create an active account without required school/class structure.',
      }, { status: 400 });
    }

    const meta = {
      full_name: fullName,
      ...placed.authMetadata,
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

    const { error: profileError } = await admin
      .from('portal_users')
      .upsert({
        id: authUserId,
        email: email.trim().toLowerCase(),
        full_name: fullName || '',
        role,
        school_id: placed.schoolId,
        school_name: placed.schoolName || schoolName,
        class_id: placed.classId,
        section_class: section_class || placed.className,
        is_active: role === 'admin' ? true : placed.isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json({ error: `Profile sync failed: ${profileError.message}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user_id: authUserId,
      class_id: placed.classId,
    });
  } catch (error: any) {
    console.error('[signup] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
