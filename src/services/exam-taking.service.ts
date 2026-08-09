import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, NotFoundError } from '@/lib/errors';
import { questionService } from './question.service';
import { examService } from './exam.service';
import type { Database, Json } from '@/types/supabase';
import { stripWrittenGradingMetadata } from '@/lib/exams/written-grading';
import { writtenPaperDefinitionError } from '@/lib/exams/question-validation';

type ExamAttemptUpdate = Database['public']['Tables']['exam_attempts']['Update'];

export class ExamTakingService {
    private seededShuffle<T>(items: T[], seed: string): T[] {
        let state = Array.from(seed).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
        const random = () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
        const result = [...items];
        for (let index = result.length - 1; index > 0; index -= 1) {
            const target = Math.floor(random() * (index + 1));
            [result[index], result[target]] = [result[target], result[index]];
        }
        return result;
    }

    async startExam(examId: string, userId: string) {
        const supabase = createAdminClient();

        // 1. Get Exam details
        const exam = await examService.getExam(examId);
        if (!exam.is_active) throw new AppError('Exam is not active', 400);
        let questions = await questionService.listQuestions(examId);
        const definitionError = writtenPaperDefinitionError(questions);
        if (definitionError) throw new AppError(definitionError, 422);

        const { data: activeAttempt, error: activeError } = await supabase
            .from('exam_attempts')
            .select('id,answers,started_at')
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .eq('status', 'in_progress')
            .maybeSingle();
        if (activeError) throw new AppError(activeError.message, 500);
        let attempt = activeAttempt;

        // 2. Check current attempts
        const { count: attemptCount, error: countError } = await supabase
            .from('exam_attempts')
            .select('*', { count: 'exact', head: true })
            .eq('exam_id', examId)
            .eq('portal_user_id', userId);
        if (countError) throw new AppError(countError.message, 500);

        if (!attempt && attemptCount && attemptCount >= (exam.max_attempts || 1)) {
            throw new AppError('Maximum attempts reached for this exam', 400);
        }

        if (!attempt) {
            const { data: created, error } = await supabase
                .from('exam_attempts')
                .insert([{
                    exam_id: examId,
                    portal_user_id: userId,
                    attempt_number: (attemptCount || 0) + 1,
                    status: 'in_progress',
                    started_at: new Date().toISOString()
                }])
                .select('id,answers,started_at')
                .single();
            if (error) throw new AppError(error.message, 500);
            attempt = created;
        }

        // A deterministic order keeps refresh/resume from reshuffling the paper.
        if (exam.randomize_questions) {
            questions = this.seededShuffle(questions, attempt.id);
        }

        // Strip correct answers if it's currently in progress
        const sanitizedQuestions = questions.map(q => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type,
            points: q.points,
            options: exam.randomize_options && q.options && Array.isArray(q.options)
                ? this.seededShuffle(q.options, `${attempt.id}:${q.id}`)
                : q.options
        }));

        const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Date.now();
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const remainingSeconds = Math.max(0, Number(exam.duration_minutes ?? 0) * 60 - elapsedSeconds);

        return {
            attemptId: attempt.id,
            resumed: !!activeAttempt,
            initialAnswers: stripWrittenGradingMetadata(attempt.answers),
            remainingSeconds,
            exam: {
                id: exam.id,
                title: exam.title,
                duration_minutes: exam.duration_minutes,
            },
            questions: sanitizedQuestions
        };
    }

    async saveProgress(examId: string, attemptId: string, userId: string, answers: Json) {
        const supabase = createAdminClient();
        const { data: attempt, error: attemptError } = await supabase
            .from('exam_attempts')
            .select('id,status,started_at,exams(duration_minutes)')
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .maybeSingle();
        if (attemptError) throw new AppError(attemptError.message, 500);
        if (!attempt || attempt.status !== 'in_progress') throw new AppError('Exam attempt is no longer in progress', 409);
        const duration = Number((attempt as any).exams?.duration_minutes || 0);
        const startedAt = attempt.started_at ? new Date(attempt.started_at).getTime() : Number.NaN;
        if (duration > 0 && Number.isFinite(startedAt) && Date.now() > startedAt + duration * 60_000 + 30_000) {
            throw new AppError('Exam deadline exceeded', 422);
        }
        const payload: ExamAttemptUpdate = { answers };
        const { data: saved, error } = await supabase
            .from('exam_attempts')
            .update(payload)
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .eq('status', 'in_progress')
            .select('id')
            .maybeSingle();

        if (error) throw new AppError('Failed to auto-save exam progress', 500);
        if (!saved) throw new AppError('Exam attempt is no longer in progress', 409);
        return true;
    }

    async recordTabSwitch(examId: string, attemptId: string, userId: string) {
        const supabase = createAdminClient();
        const { data: attempt, error: attemptError } = await supabase
            .from('exam_attempts')
            .select('tab_switches')
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .single();
        if (attemptError || !attempt) throw new AppError('Active exam attempt not found', 404);
        const { data: updated, error } = await supabase
            .from('exam_attempts')
            .update({ tab_switches: (attempt.tab_switches || 0) + 1 })
            .eq('id', attemptId)
            .eq('exam_id', examId)
            .eq('portal_user_id', userId)
            .eq('status', 'in_progress')
            .select('id')
            .maybeSingle();
        if (error) throw new AppError(error.message, 500);
        if (!updated) throw new AppError('Exam attempt is no longer in progress', 409);
    }
}

export const examTakingService = new ExamTakingService();
