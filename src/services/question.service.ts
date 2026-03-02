import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';

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

export class QuestionService {
    async listQuestions(examId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exam_questions')
            .select('*')
            .eq('exam_id', examId)
            .order('order_index', { ascending: true });

        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async createQuestion(input: QuestionInput) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exam_questions')
            .insert([input])
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return data;
    }

    async updateQuestion(id: string, input: Partial<QuestionInput>) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exam_questions')
            .update(input)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return data;
    }

    async deleteQuestion(id: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('exam_questions').delete().eq('id', id);
        if (error) throw new AppError(error.message, 400);
        return true;
    }
}

export const questionService = new QuestionService();
