import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import type { Database } from '@/types/supabase';

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | 'matching' | 'fill_in_blank';

export interface QuestionInput {
    exam_id: string;
    question_text: string;
    question_type: QuestionType;
    points: number;
    order_index?: number;
    options: any;
    correct_answer: any;
    explanation?: string;
}

/** Written/manual exams use their own FK-aligned `exam_questions` bank. */
const TABLE = 'exam_questions';

type StoredQuestion = Database['public']['Tables']['exam_questions']['Row'];

function fromRow(row: StoredQuestion): StoredQuestion {
    return { ...row };
}

function toRow(input: Partial<QuestionInput>) {
    return { ...input } as Database['public']['Tables']['exam_questions']['Update'];
}

export class QuestionService {
    async listQuestions(examId: string) {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('exam_id', examId)
            .order('order_index', { ascending: true });

        if (error) throw new AppError(error.message, 500);
        return (data ?? []).map(fromRow);
    }

    async createQuestion(input: QuestionInput) {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from(TABLE)
            .insert([toRow(input) as never])
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return fromRow(data);
    }

    async updateQuestion(id: string, input: Partial<QuestionInput>) {
        const supabase = createAdminClient();

        // Read current metadata first so updating an explanation cannot discard
        // whatever else the question is carrying there.
        const { data, error } = await supabase
            .from(TABLE)
            .update(toRow(input) as never)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return fromRow(data);
    }

    async deleteQuestion(id: string) {
        const supabase = createAdminClient();
        const { error } = await supabase.from(TABLE).delete().eq('id', id);
        if (error) throw new AppError(error.message, 400);
        return true;
    }
}

export const questionService = new QuestionService();
