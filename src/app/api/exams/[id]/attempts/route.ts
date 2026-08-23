import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { canReadWrittenExam } from '@/lib/exams/access';

async function getHandler(_req: Request, ctx: ApiContext) {
  const examId = ctx.params?.id;
  if (!examId) throw new AppError('Exam ID missing', 400);
  if (!ctx.user || !(await canReadWrittenExam(ctx.user, examId))) throw new AppError('Forbidden', 403);

  const db = createAdminClient();
  const baseColumns = 'id,portal_user_id,attempt_number,status,score,total_points,percentage,started_at,submitted_at,tab_switches';
  let query = db
    .from('exam_attempts')
    .select(`${baseColumns},grading_version,moderation_status`)
    .eq('exam_id', examId)
    .order('started_at', { ascending: false });
  if (ctx.user.role === 'student') query = query.eq('portal_user_id', ctx.user.id);
  let { data: attempts, error } = await query;
  const gradingColumnsPending = error
    && (error.code === '42703' || error.code === 'PGRST204' || /grading_version|moderation_status/i.test(error.message));
  if (gradingColumnsPending) {
    let fallbackQuery = db
      .from('exam_attempts')
      .select(baseColumns)
      .eq('exam_id', examId)
      .order('started_at', { ascending: false });
    if (ctx.user.role === 'student') fallbackQuery = fallbackQuery.eq('portal_user_id', ctx.user.id);
    const fallback = await fallbackQuery;
    attempts = fallback.data as typeof attempts;
    error = fallback.error;
  }
  if (error) throw new AppError(error.message, 500);

  const userIds = [...new Set((attempts ?? []).map(attempt => attempt.portal_user_id).filter(Boolean))] as string[];
  const usersById = new Map<string, { full_name: string | null; email: string | null }>();
  if (ctx.user.role !== 'student' && userIds.length) {
    const { data: users, error: userError } = await db.from('portal_users').select('id,full_name,email').in('id', userIds);
    if (userError) throw new AppError(userError.message, 500);
    for (const user of users ?? []) usersById.set(user.id, { full_name: user.full_name, email: user.email });
  }

  return NextResponse.json({
    success: true,
    data: (attempts ?? []).map(attempt => ({
      ...attempt,
      student: attempt.portal_user_id ? usersById.get(attempt.portal_user_id) ?? null : null,
    })),
  });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
