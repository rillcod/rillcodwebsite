import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { syncStudentAccessAndAllocation } from '@/lib/students/student-access-sync';
import { classifyStudentSessionStatus } from '@/lib/academic/session-scope';

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
      .select('id, name, school_id, teacher_id, academic_offerings:academic_offering_id(enrollment_type)')
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
          .select('id, is_active, created_at, metadata, enrollment_type')
          .eq('class_id', classId)
          .eq('role', 'student')
          .neq('is_active', false)
          .or('is_deleted.is.null,is_deleted.eq.false'),
        (admin as any)
          .from('class_term_rosters')
          .select('student_id, status, term_id, started_at, reinstated_at, updated_at')
          .eq('class_id', classId),
      ]);

      const classEnrollmentType = (cls as any)?.academic_offerings?.enrollment_type ?? null;
      const latestRosterByStudent = new Map<string, any>();
      for (const r of (rosterRows ?? []) as any[]) {
        if (!r?.student_id) continue;
        const prev = latestRosterByStudent.get(r.student_id);
        const rMs = Date.parse(r.reinstated_at || r.updated_at || r.started_at || '') || 0;
        const pMs = Date.parse(prev?.reinstated_at || prev?.updated_at || prev?.started_at || '') || 0;
        if (!prev || rMs >= pMs) latestRosterByStudent.set(r.student_id, r);
      }

      // Only sync students currently placed in THIS class who are active and confirmed for the current session
      // (never pull moved/historical students or silently confirm 3rd-term carryovers).
      targetStudentIds = ((directRows ?? []) as any[])
        .filter((row) => {
          const ar = latestRosterByStudent.get(row.id) ?? null;
          if (ar && ['withdrawn', 'ended', 'removed', 'completed'].includes(String(ar.status ?? '').toLowerCase())) {
            return false;
          }
          const sessionStatus = classifyStudentSessionStatus(
            { is_active: row.is_active, created_at: row.created_at ?? null, metadata: row.metadata ?? null, enrollment_type: row.enrollment_type ?? null },
            ar ? { status: ar.status ?? null, term_id: ar.term_id ?? null, started_at: ar.reinstated_at ?? ar.started_at ?? null } : null,
            { classEnrollmentType },
          );
          return sessionStatus === 'confirmed_current';
        })
        .map((row) => row.id);
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
