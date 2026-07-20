import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';

/**
 * GET /api/analytics/student/[id]/report
 * Generates a comprehensive progress report for a student (staff-scoped).
 */
async function getStudentReportHandler(_req: Request, ctx: ApiContext) {
  const studentId = ctx.params?.id;
  if (!studentId) return NextResponse.json({ error: 'Student ID missing' }, { status: 400 });

  const role = ctx.user?.role;
  const actorId = ctx.user?.id;
  if (!actorId || !role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Students can only view their own report
  if (role === 'student') {
    if (actorId !== studentId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    const report = await analyticsService.generateStudentReport(studentId);
    return NextResponse.json({ success: true, data: report });
  }

  if (!['admin', 'teacher', 'school'].includes(role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const admin = createAdminClient() as any;
  const { data: student } = await admin
    .from('portal_users')
    .select('id, role, school_id, class_id')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  if (role !== 'admin') {
    const { data: actor } = await admin
      .from('portal_users')
      .select('id, school_id')
      .eq('id', actorId)
      .maybeSingle();

    const schoolIds =
      role === 'teacher'
        ? await getTeacherSchoolIds(actorId, actor?.school_id ?? null)
        : actor?.school_id
          ? [actor.school_id]
          : [];

    if (!student.school_id || !schoolIds.includes(student.school_id)) {
      return NextResponse.json({ error: 'You cannot view this student report.' }, { status: 403 });
    }

    if (role === 'teacher') {
      const classScope = await getTeacherClassScope(admin, actorId, actor?.school_id ?? null);
      if (!student.class_id || !classScope.classIds.includes(student.class_id)) {
        return NextResponse.json({ error: 'You can only view students in classes you own.' }, { status: 403 });
      }
    }
  }

  const report = await analyticsService.generateStudentReport(studentId);
  return NextResponse.json({ success: true, data: report });
}

export const GET = (req: any, ctx: any) => withApiProxy(getStudentReportHandler)(req, ctx);
