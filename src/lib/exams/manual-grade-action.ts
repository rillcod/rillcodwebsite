import { z } from 'zod';
import { AppError, NotFoundError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { gradingService } from '@/services/grading.service';
import { canReviewWrittenExam } from './access';
import type { ApiContext } from '@/lib/api-wrapper';

type Actor = NonNullable<ApiContext['user']>;

const manualGradeSchema = z.object({
  scores: z.record(z.string(), z.number().finite().min(0)),
  feedback: z.string().trim().max(5000).nullable().optional(),
}).strict();

export async function applyManualWrittenGrade(actor: Actor, examId: string, attemptId: string, rawBody: unknown) {
  if (!['admin', 'teacher', 'school'].includes(actor.role)) throw new AppError('Forbidden', 403);
  if (!(await canReviewWrittenExam(actor, examId))) throw new AppError('Forbidden exam scope', 403);
  const parsed = manualGradeSchema.safeParse(rawBody);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid grading data', 400);

  const db = createAdminClient();
  const { data: attempt, error } = await db.from('exam_attempts').select('id').eq('id', attemptId).eq('exam_id', examId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  if (!attempt) throw new NotFoundError('Exam attempt not found');

  const result = await gradingService.manualGrade(attemptId, parsed.data.scores, parsed.data.feedback ?? null);
  await logAudit(db as any, {
    action: result.grade.status === 'graded' ? 'finalize_written_exam_grade' : 'save_written_exam_review',
    actorId: actor.id,
    resourceType: 'exam_attempt',
    resourceId: attemptId,
    tableName: 'exam_attempts',
    oldValues: {
      score: result.previousScore,
      status: result.previousStatus,
      manual_questions_scored: Object.keys(result.previous.manual_scores).length,
    },
    newValues: {
      exam_id: examId,
      score: result.grade.score,
      total_points: result.grade.totalPoints,
      percentage: result.grade.percentage,
      status: result.grade.status,
      manual_questions_scored: Object.keys(result.grade.manualScores).length,
      manual_questions_total: result.grade.manualQuestionIds.length,
      feedback_updated: parsed.data.feedback !== undefined,
    },
  });
  return {
    message: result.grade.status === 'graded' ? 'Grade published and student notified' : 'Review progress saved',
    data: { status: result.grade.status, score: result.grade.score, percentage: result.grade.percentage },
  };
}
