import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { preparePortalStructure } from '@/lib/portal/ensure-structure';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/auth/complete-public-signup
 * After client auth.signUp, place school (+ auto class for students) and activate safely.
 * Body: { role: 'student'|'parent', school_id: string, full_name?: string, child_name?: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const role = String(body.role || '').toLowerCase();
    const schoolId = body.school_id as string | undefined;
    const fullName = (body.full_name as string | undefined) || user.user_metadata?.full_name || user.email?.split('@')[0] || '';
    const childName = (body.child_name as string | undefined)?.trim() || null;

    if (!['student', 'parent'].includes(role)) {
      return NextResponse.json({ error: 'Only student or parent public signup is supported' }, { status: 400 });
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'Please select a school.' }, { status: 400 });
    }

    const admin = adminClient();
    const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 400 });

    const { data: existingPortal } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (existingPortal && existingPortal.role !== role) {
      return NextResponse.json({
        error: `This account is already registered as a ${existingPortal.role}. Sign in with that role instead.`,
        code: 'EMAIL_ROLE_CONFLICT',
      }, { status: 409 });
    }

    const placed = await preparePortalStructure(admin as any, {
      role,
      schoolId: school.id,
      schoolName: school.name,
      wantActive: true,
      autoCreateClass: role === 'student',
      classHints: role === 'student' ? ['General Placement'] : undefined,
    });

    if (!placed.isActive) {
      console.error('Public signup placement preparation failed', placed.error);
      return NextResponse.json({
        error: 'School access could not be prepared. Please try again or contact support.',
      }, { status: 503 });
    }

    const { error: upsertErr } = await admin.from('portal_users').upsert({
      id: user.id,
      email: user.email?.trim().toLowerCase() || '',
      full_name: fullName,
      role,
      school_id: placed.schoolId,
      school_name: placed.schoolName || school.name,
      class_id: placed.classId,
      section_class: placed.className,
      enrollment_type: role === 'student' ? 'school' : null,
      bio: role === 'parent' && childName ? `Child: ${childName}` : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (upsertErr) {
      console.error('Public signup portal profile upsert failed', upsertErr);
      return NextResponse.json({ error: 'School access could not be linked. Please try again.' }, { status: 500 });
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: fullName,
        role,
        school_id: placed.schoolId,
        ...(placed.classId ? { class_id: placed.classId } : {}),
      },
        ...(role === 'student' ? { enrollment_type: 'school' } : {}),
    });
    if (metadataError) {
      console.error('Public signup auth metadata update failed', metadataError);
    }

    return NextResponse.json({
      success: true,
      school_id: placed.schoolId,
      class_id: placed.classId,
      class_name: placed.className,
    });
  } catch (err: unknown) {
    console.error('Public signup completion failed', err);
    return NextResponse.json({ error: 'We could not complete school access just now. Please try again.' }, { status: 500 });
  }
}
