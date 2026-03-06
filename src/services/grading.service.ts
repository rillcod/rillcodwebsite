import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { examService } from './exam.service';
import { questionService } from './question.service';
import { notificationsService } from './notifications.service';
import { templatesService } from './templates.service';
import { queueService } from './queue.service';

export class GradingService {
    async submitExam(attemptId: string, userId: string, finalAnswers: any) {
        const supabase = await createClient();

        // 1. Get attempt and exam details
        const { data: attempt, error: attemptErr } = await supabase
            .from('exam_attempts')
            .select('*')
            .eq('id', attemptId)
            .eq('portal_user_id', userId)
            .single();

        if (attemptErr || !attempt) throw new NotFoundError('Attempt not found');
        if (attempt.status !== 'in_progress') throw new AppError('Exam already submitted', 400);

        const { data: exam, error: examErr } = await supabase
            .from('exams')
            .select('*')
            .eq('id', attempt.exam_id as string)
            .single();
        if (examErr || !exam || !exam.id) throw new AppError('Exam not found for this attempt', 404);

        const questions = await questionService.listQuestions(exam.id as string);

        // 2. Automated Grading for objective questions
        let score = 0;
        let totalPoints = 0;
        let needsManualGrading = false;

        const gradedAnswers = questions.map(q => {
            const qPoints = q.points || 0;
            totalPoints += qPoints;
            const userAnswer = finalAnswers[q.id];
            let questionScore = 0;

            if (['essay', 'short_answer'].includes(q.question_type || '')) {
                needsManualGrading = true;
                // Partial credit or placeholder if we have it, otherwise wait for teacher
            } else {
                // Simple string/json matching for objective
                if (JSON.stringify(userAnswer) === JSON.stringify(q.correct_answer)) {
                    questionScore = qPoints;
                    score += qPoints;
                }
            }

            return {
                question_id: q.id,
                user_answer: userAnswer,
                correct_answer: q.correct_answer,
                score: questionScore,
                type: q.question_type
            };
        });

        const percentage = (score / totalPoints) * 100;
        const status = needsManualGrading ? 'submitted' : 'graded';

        // 3. Update attempt record
        const { data: updatedAttempt, error: updateErr } = await supabase
            .from('exam_attempts')
            .update({
                answers: finalAnswers,
                status,
                score,
                total_points: totalPoints,
                percentage,
                submitted_at: new Date().toISOString()
            })
            .eq('id', attemptId)
            .select()
            .single();

        if (updateErr) throw new AppError(updateErr.message, 500);

        // 4. Trigger Notifications if already graded
        if (status === 'graded') {
            this.notifyStudent(userId, exam?.title || 'Exam', percentage);

            // Trigger Gamification points if passing
            if (percentage >= (exam?.passing_score || 50)) {
                const { gamificationService } = await import('./gamification.service');
                const { badgeService } = await import('./badge.service');

                const result = await gamificationService.awardPoints(userId, 'quiz_pass', exam?.id || attemptId, `Passed exam: ${exam?.title || 'Exam'}`);
                await badgeService.awardBadgeIfEligible(userId, 'points_milestone', { totalPoints: result.totalPoints });
            }
        }

        return updatedAttempt;
    }

    private async notifyStudent(userId: string, examTitle: string, percentage: number) {
        try {
            const supabase = await createClient();
            const { data: user } = await supabase.from('portal_users').select('email, full_name').eq('id', userId).single();

            if (user?.email) {
                const template = await templatesService.getTemplate('Grade Published', 'email');
                const html = templatesService.render(template.content, {
                    user_name: user.full_name,
                    course_name: `Exam: ${examTitle}`,
                    grade: `${percentage.toFixed(2)}%`,
                    notes: 'Automated grading completed.'
                });

                await queueService.queueNotification(userId, 'email', {
                    to: user.email,
                    subject: `Exam Result: ${examTitle}`,
                    html
                });
            }
        } catch (err) {
            console.error('Failed to notify student of exam result:', err);
        }
    }

    async manualGrade(attemptId: string, scores: Record<string, number>, feedback: string) {
        const supabase = await createClient();

        const { data: attempt } = await supabase
            .from('exam_attempts')
            .select('*, exams(title)')
            .eq('id', attemptId)
            .single();

        if (!attempt) throw new NotFoundError('Attempt not found');

        // Recalculate total score
        let newScore = (attempt.score || 0);
        Object.values(scores).forEach(s => newScore += s);

        const newPercentage = (newScore / (attempt.total_points || 100)) * 100;

        await supabase
            .from('exam_attempts')
            .update({
                score: newScore,
                percentage: newPercentage,
                status: 'graded'
            })
            .eq('id', attemptId);

        if (attempt.portal_user_id) {
            const examData = attempt.exams as any;
            this.notifyStudent(attempt.portal_user_id, examData?.title || 'Exam', newPercentage);
        }
        return true;
    }
}

export const gradingService = new GradingService();
