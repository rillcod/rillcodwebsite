import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { examService } from '@/services/exam.service';

async function courseIdsForSchools(schoolIds: string[]) {
  if (!schoolIds.length) return [];
  const { data, error } = await createAdminClient().from('courses').select('id').in('school_id', schoolIds);
  if (error) throw new AppError(error.message, 500);
  return (data ?? []).map(course => course.id);
}

async function getHandler(req: Request, ctx: ApiContext) {
  if (!ctx.user || !['admin', 'teacher', 'school'].includes(ctx.user.role)) throw new AppError('Grading access required', 403);

  let exams;
  if (ctx.user.role === 'admin') {
    exams = await examService.listExams();
  } else if (ctx.user.role === 'school') {
    if (!ctx.user.tenantId) throw new AppError('School account is not linked to a tenant', 403);
    exams = await examService.listExams(undefined, ctx.user.tenantId);
  } else {
    const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
    exams = await examService.listExams(undefined, undefined, await courseIdsForSchools(schoolIds));
  }
  const examIds = exams.map(exam => exam.id);
  const url = new URL(req.url);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  if (!examIds.length) {
    return NextResponse.json({
      success: true,
      data: [],
      pagination: { offset, limit, returned: 0, has_more: false },
    });
  }

  const db = createAdminClient();
  const { data: attempts, error } = await db
    .from('exam_attempts')
    .select('id,exam_id,portal_user_id,status,score,total_points,percentage,submitted_at,tab_switches')
    .in('exam_id', examIds)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new AppError(error.message, 500);

  const userIds = [...new Set((attempts ?? []).map(attempt => attempt.portal_user_id).filter(Boolean))] as string[];
  const { data: users, error: userError } = userIds.length
    ? await db.from('portal_users').select('id,full_name,email').in('id', userIds)
    : { data: [], error: null };
  if (userError) throw new AppError(userError.message, 500);
  const usersById = new Map((users ?? []).map(user => [user.id, user]));
  const examsById = new Map(exams.map(exam => [exam.id, exam]));

  return NextResponse.json({
    success: true,
    data: (attempts ?? []).map(attempt => ({
      ...attempt,
      student: attempt.portal_user_id ? usersById.get(attempt.portal_user_id) ?? null : null,
      exam: attempt.exam_id ? examsById.get(attempt.exam_id) ?? null : null,
    })),
    pagination: {
      offset,
      limit,
      returned: (attempts ?? []).length,
      has_more: (attempts ?? []).length === limit,
    },
  });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
