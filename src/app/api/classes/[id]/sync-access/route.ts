import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { syncStudentAccessAndAllocation } from '@/lib/students/student-access-sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/classes/[id]/sync-access
 * Aligns all active students in a class to the current session, retires stale old
 * programme allocations so old exams never bleed, and repairs Supabase Auth readiness
 * so students can log in and take exams immediately without manual password resets.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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
    const { data: caller } = await admin
      .from('portal_users')
      .select('id, role, school_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id: classId } = await context.params;
    const { data: cls } = await admin
      .from('classes')
      .select('id, name, school_id, teacher_id')
      .eq('id', classId)
      .maybeSingle();

    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    if (caller.role === 'school' && caller.school_id !== cls.school_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (caller.role === 'teacher' && cls.teacher_id !== caller.id) {
      const allowedSchools = await getTeacherSchoolIds(caller.id, caller.school_id);
      if (!cls.school_id || !allowedSchools.includes(cls.school_id)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({}));
    let targetStudentIds: string[] = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
      : [];

    if (targetStudentIds.length === 0) {
      const [{ data: directRows }, { data: rosterRows }] = await Promise.all([
        admin
          .from('portal_users')
          .select('id')
          .eq('class_id', classId)
          .eq('role', 'student')
          .or('is_deleted.is.null,is_deleted.eq.false'),
        (admin as any)
          .from('class_term_rosters')
          .select('student_id, status')
          .eq('class_id', classId),
      ]);

      const withdrawnInClass = new Set(
        ((rosterRows ?? []) as Array<{ student_id?: string; status?: string }>)
          .filter((r) => String(r.status ?? '').toLowerCase() === 'withdrawn')
          .map((r) => r.student_id)
          .filter(Boolean) as string[],
      );
      const activeInRoster = ((rosterRows ?? []) as Array<{ student_id?: string; status?: string }>)
        .filter((r) => String(r.status ?? '').toLowerCase() === 'active')
        .map((r) => r.student_id)
        .filter(Boolean) as string[];

      const combined = new Set<string>(activeInRoster);
      for (const row of (directRows ?? []) as Array<{ id: string }>) {
        if (!withdrawnInClass.has(row.id)) combined.add(row.id);
      }
      targetStudentIds = Array.from(combined);
    }

    const result = await syncStudentAccessAndAllocation(admin as any, {
      studentIds: targetStudentIds,
      classId,
      actorId: caller.id,
      syncAuth: true,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
