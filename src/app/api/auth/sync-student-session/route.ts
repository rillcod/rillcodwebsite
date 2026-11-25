import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { syncStudentAccessAndAllocation } from '@/lib/students/student-access-sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/sync-student-session
 * Authenticated self-repair for students who signed in with valid credentials
 * whose `portal_users` row had stale `is_active: false` or missing `class_id` / `school_id`
 * despite having an active `class_term_rosters` or `students` placement.
 */
export async function POST() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createEngagementAdminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('id, role, is_active, is_deleted, full_name, metadata, school_id, class_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.is_deleted || profile.role !== 'student') {
      return NextResponse.json({ repaired: false, profile: profile ?? null });
    }

    // Find active roster placement first
    const { data: activeRoster } = await (admin as any)
      .from('class_term_rosters')
      .select('class_id, school_id, status, updated_at')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let resolvedClassId: string | null = activeRoster?.class_id ?? profile.class_id ?? null;

    // Fallback to shadow `students` registry class match when legacy account lacks class_id
    if (!resolvedClassId) {
      const { data: regStudent } = await admin
        .from('students')
        .select('school_id, current_class, section, is_active')
        .eq('user_id', user.id)
        .maybeSingle();

      const classLabel = String(regStudent?.current_class || regStudent?.section || '').trim();
      const targetSchool = regStudent?.school_id || profile.school_id;
      if (classLabel && targetSchool) {
        const { data: matchedClass } = await admin
          .from('classes')
          .select('id')
          .eq('school_id', targetSchool)
          .ilike('name', classLabel)
          .limit(1)
          .maybeSingle();
        if (matchedClass?.id) resolvedClassId = matchedClass.id;
      }
    }

    if (resolvedClassId) {
      await syncStudentAccessAndAllocation(admin as any, {
        studentIds: [user.id],
        classId: resolvedClassId,
        actorId: user.id,
        syncAuth: false,
      });

      const { data: refreshed } = await admin
        .from('portal_users')
        .select('role, is_active, is_deleted, full_name, metadata, school_id, class_id')
        .eq('id', user.id)
        .maybeSingle();

      return NextResponse.json({ repaired: true, profile: refreshed ?? profile });
    }

    return NextResponse.json({ repaired: false, profile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
