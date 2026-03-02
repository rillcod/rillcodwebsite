import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';
import { questionService } from './question.service';
import { examService } from './exam.service';

export class ExamTakingService {
    async startExam(examId: string, userId: string) {
        const supabase = await createClient();

        // 1. Get Exam details
        const exam = await examService.getExam(examId);
        if (!exam.is_active) throw new AppError('Exam is not active', 400);

        // 2. Check current attempts
        const { count: attemptCount } = await supabase
            .from('exam_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', examId)
            .eq('portal_user_id', userId);

        if (attemptCount && attemptCount >= (exam.max_attempts || 1)) {
            throw new AppError('Maximum attempts reached for this exam', 400);
        }

        // 3. Create new attempt
        const { data: attempt, error } = await supabase
            .from('exam_attempts')
            .insert([{
                exam_id: examId,
                portal_user_id: userId,
                attempt_number: (attemptCount || 0) + 1,
                status: 'in_progress',
                started_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 500);

        // 4. Fetch and potentially randomize questions
        let questions = await questionService.listQuestions(examId);

        if (exam.randomize_questions) {
            questions = questions.sort(() => Math.random() - 0.5);
        }

        // Strip correct answers if it's currently in progress
        const sanitizedQuestions = questions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            points: q.points,
            options: exam.randomize_options && q.options && Array.isArray(q.options)
                ? (q.options as any[]).sort(() => Math.random() - 0.5)
                : q.options
        }));

        return {
            attemptId: attempt.id,
            exam: {
                title: exam.title,
                duration_minutes: exam.duration_minutes,
            },
            questions: sanitizedQuestions
        };
    }

    async saveProgress(attemptId: string, userId: string, answers: any) {
        const supabase = await createClient();
        const { error } = await supabase
            .from('exam_attempts')
            .update({ answers, updated_at: new Date().toISOString() })
            .eq('id', attemptId)
            .eq('portal_user_id', userId)
            .eq('status', 'in_progress');

        if (error) throw new AppError('Failed to auto-save exam progress', 500);
        return true;
    }

    async recordTabSwitch(attemptId: string, userId: string) {
        const supabase = await createClient();
        const { data: attempt } = await supabase
            .from('exam_attempts')
            .select('tab_switches')
            .eq('id', attemptId)
            .eq('portal_user_id', userId)
            .single();

        if (attempt) {
            await supabase
                .from('exam_attempts')
                .update({ tab_switches: (attempt.tab_switches || 0) + 1 })
                .eq('id', attemptId);
        }
    }
}

export const examTakingService = new ExamTakingService();
