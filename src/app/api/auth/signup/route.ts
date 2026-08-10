import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';
import { findAuthUserIdByEmail } from '@/lib/auth/list-all-users';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';

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
      .select('role, school_id, is_active, is_deleted')
      .eq('id', user.id)
      .single();

    if (!callerProfile
      || callerProfile.is_active === false
      || callerProfile.is_deleted === true
      || !roleHasCapability(callerProfile.role, 'create_accounts')) {
      return NextResponse.json({ error: 'An active admin or school manager account is required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, fullName, role: rawRole, school_id, class_id, section_class, grade } = body;
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedFullName = String(fullName ?? '').trim();
    const role = String(rawRole ?? '').trim().toLowerCase();

    // Validate required fields first
    if (!normalizedEmail || !password || !normalizedFullName || !role) {
      return NextResponse.json({ error: 'Full name, email, password, and role are required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const { isKnownPortalRole } = await import('@/lib/portal/structure');
    if (!isKnownPortalRole(role)) {
      return NextResponse.json({
        error: `Invalid role "${role}". Allowed: admin, teacher, school, parent, student.`,
        code: 'INVALID_ROLE',
      }, { status: 400 });
    }

    // Minimum password length
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Creation is not reconciliation. A portal profile already carrying this
    // email may own grades, classes, payments, or family links under its UUID.
    const { data: existingPortalRows, error: existingPortalError } = await admin
      .from('portal_users')
      .select('id, role, is_deleted')
      .eq('email', normalizedEmail)
      .limit(2);
    if (existingPortalError) {
      return NextResponse.json({ error: `Portal identity check failed: ${existingPortalError.message}` }, { status: 500 });
    }
    if ((existingPortalRows ?? []).length > 0) {
      const existing = existingPortalRows![0];
      return NextResponse.json({
        error: existing.is_deleted
          ? 'An archived portal profile already uses this email. Restore or reconcile it instead of creating a duplicate.'
          : `This email is already registered as a ${existing.role} portal account.`,
        code: (existingPortalRows ?? []).length > 1 ? 'DUPLICATE_PORTAL_EMAIL' : 'EMAIL_ALREADY_REGISTERED',
      }, { status: 409 });
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
      full_name: normalizedFullName,
      ...placed.authMetadata,
    };

    // Create or resolve existing auth user
    let authUserId: string | null = null;
    let createdAuthUser = false;

    const { data: authData, error: signupErr } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: meta,
    });

    if (signupErr) {
      if (signupErr.message.includes('already been registered') || signupErr.message.includes('already exists')) {
        const existingId = await findAuthUserIdByEmail(admin as any, normalizedEmail);
        if (existingId) {
          const { data: existingPortal } = await admin
            .from('portal_users')
            .select('role, email')
            .eq('id', existingId)
            .maybeSingle();
          if (existingPortal && existingPortal.role !== role) {
            return NextResponse.json({
              error: `This email is already registered as a ${existingPortal.role} account. Use a different email.`,
              code: 'EMAIL_ROLE_CONFLICT',
            }, { status: 409 });
          }
          if (existingPortal && String(existingPortal.email ?? '').trim().toLowerCase() !== normalizedEmail) {
            return NextResponse.json({
              error: 'This authentication identity is already linked to a different portal email. Run account reconciliation.',
              code: 'AUTH_PORTAL_EMAIL_CONFLICT',
            }, { status: 409 });
          }
          authUserId = existingId;
          // Linking an existing Auth identity must never double as a silent
          // password reset. Keep its credentials and only align safe metadata.
          const { error: metadataError } = await admin.auth.admin.updateUserById(authUserId, {
            user_metadata: meta,
          });
          if (metadataError) {
            return NextResponse.json({ error: `Authentication metadata sync failed: ${metadataError.message}` }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: 'User exists in Auth but could not be resolved. Contact support.' }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: signupErr.message }, { status: 400 });
      }
    } else {
      authUserId = authData.user?.id ?? null;
      createdAuthUser = !!authUserId;
    }

    if (!authUserId) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
    }

    // Same-role reuse only — never overwrite a different portal role via upsert.
    const { data: portalById, error: portalByIdError } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', authUserId)
      .maybeSingle();
    if (portalByIdError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({ error: `Portal identity check failed: ${portalByIdError.message}` }, { status: 500 });
    }
    if (portalById && portalById.role !== role) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({
        error: `This email is already registered as a ${portalById.role} account. Use a different email.`,
        code: 'EMAIL_ROLE_CONFLICT',
      }, { status: 409 });
    }
    const { data: portalEmailRows, error: portalByEmailError } = await admin
      .from('portal_users')
      .select('id, role')
      .eq('email', normalizedEmail)
      .limit(2);
    if (portalByEmailError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({ error: `Portal email check failed: ${portalByEmailError.message}` }, { status: 500 });
    }
    if ((portalEmailRows ?? []).length > 1) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({
        error: 'Multiple portal profiles already use this email. Run account reconciliation before creating another account.',
        code: 'DUPLICATE_PORTAL_EMAIL',
      }, { status: 409 });
    }
    const portalByEmail = portalEmailRows?.[0] ?? null;
    if (portalByEmail && portalByEmail.id !== authUserId) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({
        error: `This email already belongs to a ${portalByEmail.role} portal profile with a different identity. Run account reconciliation instead of creating a duplicate.`,
        code: 'EMAIL_ID_CONFLICT',
      }, { status: 409 });
    }

    const { error: profileError } = await admin
      .from('portal_users')
      .upsert({
        id: authUserId,
        email: normalizedEmail,
        full_name: normalizedFullName,
        role,
        school_id: placed.schoolId,
        school_name: placed.schoolName || schoolName,
        class_id: placed.classId,
        section_class: section_class || placed.className,
        is_active: role === 'admin' ? true : placed.isActive,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return NextResponse.json({ error: `Profile sync failed: ${profileError.message}` }, { status: 400 });
    }

    if (role === 'teacher' && placed.schoolId) {
      const { error: teacherSchoolError } = await admin.from('teacher_schools').upsert(
        {
          teacher_id: authUserId,
          school_id: placed.schoolId,
        },
        { onConflict: 'teacher_id,school_id' },
      );
      if (teacherSchoolError) {
        if (createdAuthUser) {
          await admin.from('portal_users').delete().eq('id', authUserId);
          await admin.auth.admin.deleteUser(authUserId).catch(() => {});
        } else {
          await admin.from('portal_users').update({ is_active: false }).eq('id', authUserId);
        }
        return NextResponse.json({
          error: `Teacher school assignment failed: ${teacherSchoolError.message}. The incomplete account was not activated.`,
        }, { status: 500 });
      }
    }
    await logAudit(admin as any, {
      action: 'create_user',
      actorId: user.id,
      resourceType: 'portal_user',
      resourceId: authUserId,
      tableName: 'portal_users',
      newValues: {
        email: normalizedEmail,
        role,
        school_id: placed.schoolId,
        class_id: placed.classId,
        is_active: role === 'admin' ? true : placed.isActive,
      },
    });


    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user_id: authUserId,
      class_id: placed.classId,
      temporary_password_issued: createdAuthUser,
    });
  } catch (error: any) {
    console.error('[signup] error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
