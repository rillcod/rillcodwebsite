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
      return NextResponse.json({ error: 'school_id is required' }, { status: 400 });
    }

    const admin = adminClient();
    const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 400 });

    const placed = await preparePortalStructure(admin as any, {
      role,
      schoolId: school.id,
      schoolName: school.name,
      wantActive: true,
      autoCreateClass: role === 'student',
      classHints: role === 'student' ? ['General Placement'] : undefined,
    });

    if (!placed.isActive) {
      return NextResponse.json({
        error: placed.error || 'Could not complete signup with required school/class structure.',
      }, { status: 400 });
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
      bio: role === 'parent' && childName ? `Child: ${childName}` : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: fullName,
        role,
        school_id: placed.schoolId,
        ...(placed.classId ? { class_id: placed.classId } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      school_id: placed.schoolId,
      class_id: placed.classId,
      class_name: placed.className,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
