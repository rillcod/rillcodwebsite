import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, NotFoundError } from '@/lib/errors';
import { questionService } from './question.service';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';
import {
    WRITTEN_GRADING_META_KEY,
    WrittenGradingError,
    gradeWrittenAnswers,
    readWrittenGradingMetadata,
    stripWrittenGradingMetadata,
    withWrittenGradingMetadata,
} from '@/lib/exams/written-grading';
import type { Json } from '@/types/supabase';

/** Written/manual exams share the objective matching rules used by CBT. */
export class GradingService {
    async submitExam(examId: string, attemptId: string, userId: string, finalAnswers: unknown) {
        const supabase = createAdminClient();
        const { data: attempt, error: attemptErr } = await supabase
            .from('exam_attempts')
            .select('*, exams(title,duration_minutes,passing_score)')
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .maybeSingle();

        if (attemptErr) throw new AppError(attemptErr.message, 500);
        if (!attempt) throw new NotFoundError('Attempt not found');
        if (attempt.status !== 'in_progress') throw new AppError('Exam already submitted', 409);

        const exam = (attempt as any).exams;
        if (!exam) throw new NotFoundError('Exam not found for this attempt');
        const questions = await questionService.listQuestions(examId);
        const submittedAnswers = stripWrittenGradingMetadata(finalAnswers);
        const savedAnswers = stripWrittenGradingMetadata(attempt.answers);
        const duration = Math.max(0, Number(exam.duration_minutes ?? 0));
        const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Number.NaN;
        const expired = duration > 0 && Number.isFinite(startedAt)
            && Date.now() > startedAt + duration * 60_000 + 30_000;
        // After the deadline, only answers already accepted by autosave are trusted.
        const answers = expired ? savedAnswers : submittedAnswers;

        let grade;
        try {
            grade = gradeWrittenAnswers(questions, answers);
        } catch (error) {
            if (error instanceof WrittenGradingError) throw new AppError(error.message, 422);
            throw error;
        }
        const storedAnswers = withWrittenGradingMetadata(answers, grade, null);
        const { data: updatedAttempt, error: updateErr } = await supabase
            .from('exam_attempts')
            .update({
                answers: storedAnswers as Json,
                status: grade.status,
                score: grade.score,
                total_points: grade.totalPoints,
                percentage: grade.percentage,
                submitted_at: new Date().toISOString(),
            })
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .eq('status', 'in_progress')
            .select()
            .maybeSingle();

        if (updateErr) throw new AppError(updateErr.message, 500);
        if (!updatedAttempt) throw new AppError('Exam attempt is no longer in progress', 409);

        if (grade.status === 'graded') {
            await this.notifyStudent(userId, exam.title || 'Exam', grade.percentage);
            if (grade.percentage >= Number(exam.passing_score ?? 50)) {
                const { gamificationService } = await import('./gamification.service');
                const { badgeService } = await import('./badge.service');
                const result = await gamificationService.awardPoints(
                    userId,
                    'quiz_pass',
                    examId,
                    `Passed exam: ${exam.title || 'Exam'}`,
                );
                await badgeService.awardBadgeIfEligible(userId, 'points_milestone', { totalPoints: result.totalPoints });
            }
        }

        return { attempt: updatedAttempt, expired, grade };
    }

    private async notifyStudent(userId: string, examTitle: string, percentage: number) {
        try {
            const supabase = createAdminClient();
            const { data: user } = await supabase
                .from('portal_users')
                .select('email, full_name')
                .eq('id', userId)
                .maybeSingle();

            if (user?.email) {
                const template = await templatesService.getTemplate('Grade Published', 'email');
                const html = templatesService.render(template.content, {
                    user_name: user.full_name,
                    course_name: `Exam: ${examTitle}`,
                    grade: `${percentage.toFixed(2)}%`,
                    notes: 'Grading completed.',
                });
                await queueService.queueNotification(userId, 'email', {
                    to: user.email,
                    subject: `Exam Result: ${examTitle}`,
                    html,
                });
            }
        } catch (error) {
            console.error('Failed to notify student of exam result:', error);
        }
    }

    async manualGrade(attemptId: string, rawScores: Record<string, unknown>, feedback: string | null) {
        const supabase = createAdminClient();
        const { data: attempt, error: attemptError } = await supabase
            .from('exam_attempts')
            .select('*, exams(title)')
            .eq('id', attemptId)
            .maybeSingle();

        if (attemptError) throw new AppError(attemptError.message, 500);
        if (!attempt) throw new NotFoundError('Attempt not found');
        if (!attempt.exam_id) throw new NotFoundError('Exam not found for this attempt');
        if (!['submitted', 'graded'].includes(attempt.status ?? '')) {
            throw new AppError('Only submitted exams can be manually graded', 409);
        }

        const questions = await questionService.listQuestions(attempt.exam_id);
        const answers = stripWrittenGradingMetadata(attempt.answers);
        const previous = readWrittenGradingMetadata(attempt.answers);
        const rawAnswers = attempt.answers && typeof attempt.answers === 'object' && !Array.isArray(attempt.answers)
            ? attempt.answers as Record<string, unknown>
            : {};
        const hasPerQuestionEvidence = !!rawAnswers[WRITTEN_GRADING_META_KEY];
        if (attempt.status === 'graded' && !hasPerQuestionEvidence && questions.some((question) => {
            const type = String(question.question_type ?? '').toLowerCase();
            return ['essay', 'short_answer', 'fill_in_blank', 'fill_blank', 'coding_blocks'].includes(type);
        })) {
            throw new AppError('This legacy published grade is protected because it has no per-question score evidence. Do not overwrite it.', 409);
        }
        let grade;
        try {
            grade = gradeWrittenAnswers(questions, answers, previous.manual_scores, rawScores);
        } catch (error) {
            if (error instanceof WrittenGradingError) throw new AppError(error.message, 422);
            throw error;
        }
        const normalizedFeedback = feedback?.trim() || previous.feedback;
        const storedAnswers = withWrittenGradingMetadata(answers, grade, normalizedFeedback);
        const { data: updated, error: updateError } = await supabase
            .from('exam_attempts')
            .update({
                answers: storedAnswers as Json,
                score: grade.score,
                total_points: grade.totalPoints,
                percentage: grade.percentage,
                status: grade.status,
            })
            .eq('id', attemptId)
            .in('status', ['submitted', 'graded'])
            .select()
            .maybeSingle();
        if (updateError) throw new AppError(updateError.message, 500);
        if (!updated) throw new AppError('The exam attempt changed while it was being graded', 409);

        if (grade.status === 'graded' && attempt.portal_user_id) {
            const exam = (attempt as any).exams;
            await this.notifyStudent(attempt.portal_user_id, exam?.title || 'Exam', grade.percentage);
        }
        return {
            attempt: updated,
            previous,
            previousScore: attempt.score,
            previousStatus: attempt.status,
            grade,
            feedback: normalizedFeedback,
        };
    }
}

export const gradingService = new GradingService();
