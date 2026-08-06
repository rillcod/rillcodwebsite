import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

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

/**
 * The exam question bank.
 *
 * This service read `exam_questions`, which holds nothing and never has: the
 * live bank is `cbt_questions`, with 332 rows behind 20 exams and 49 sittings.
 * Because it sits behind `/api/exams/[id]/start` and `/submit`, starting an exam
 * through this path returned an empty paper. Two faults stacked — the wrong
 * table, and that table also carries no RLS policy, so the request would have
 * read nothing even had rows existed.
 *
 * `cbt_questions` has no `explanation` column; it carries `metadata` instead, so
 * explanations round-trip through there rather than being silently dropped.
 */
const TABLE = 'cbt_questions';

type StoredQuestion = Record<string, any>;

/** Present an explanation held in metadata as a first-class field. */
function fromRow(row: StoredQuestion | null | undefined): StoredQuestion {
    if (!row) return {} as StoredQuestion;
    const explanation = row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as any).explanation
        : undefined;
    return explanation === undefined ? { ...row } : { ...row, explanation };
}

/** Fold an explanation back into metadata, leaving any other metadata intact. */
function toRow(input: Partial<QuestionInput>, existingMetadata?: StoredQuestion | null): StoredQuestion {
    const { explanation, ...rest } = input;
    const row: StoredQuestion = { ...rest };
    if (explanation !== undefined) {
        row.metadata = {
            ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
            explanation,
        };
    }
    return row;
}

export class QuestionService {
    async listQuestions(examId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .eq('exam_id', examId)
            .order('order_index', { ascending: true });

        if (error) throw new AppError(error.message, 500);
        return (data ?? []).map(fromRow);
    }

    async createQuestion(input: QuestionInput) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from(TABLE)
            .insert([toRow(input) as never])
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return fromRow(data);
    }

    async updateQuestion(id: string, input: Partial<QuestionInput>) {
        const supabase = await createClient();

        // Read current metadata first so updating an explanation cannot discard
        // whatever else the question is carrying there.
        let existingMetadata: StoredQuestion | null = null;
        if (input.explanation !== undefined) {
            const { data: current } = await supabase.from(TABLE).select('metadata').eq('id', id).maybeSingle();
            existingMetadata = (current?.metadata ?? null) as StoredQuestion | null;
        }

        const { data, error } = await supabase
            .from(TABLE)
            .update(toRow(input, existingMetadata) as never)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return fromRow(data);
    }

    async deleteQuestion(id: string) {
        const supabase = await createClient();
        const { error } = await supabase.from(TABLE).delete().eq('id', id);
        if (error) throw new AppError(error.message, 400);
        return true;
    }
}

export const questionService = new QuestionService();
