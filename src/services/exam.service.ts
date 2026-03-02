import { createClient } from '@/lib/supabase/server';
import { AppError, NotFoundError } from '@/lib/errors';

export interface ExamInput {
    course_id: string;
    title: string;
    description?: string;
    duration_minutes: number;
    total_points?: number;
    passing_score?: number;
    randomize_questions?: boolean;
    randomize_options?: boolean;
    max_attempts?: number;
    is_active?: boolean;
    tenant_id?: string;
}

export class ExamService {
    async listExams(courseId?: string, tenantId?: string) {
        const supabase = await createClient();
        let query = supabase.from('exams').select('*');

        if (courseId) {
            query = query.eq('course_id', courseId);
        }

        if (tenantId) {
            // Assuming courses have school_id or exams table will have it
            // Based on schema, exams only has course_id. We need to join.
            query = query.filter('course_id', 'in',
                supabase.from('courses').select('id').eq('school_id', tenantId)
            );
        }

        const { data, error } = await query;
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async getExam(id: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exams')
            .select('*, courses(school_id)')
            .eq('id', id)
            .single();

        if (error || !data) throw new NotFoundError('Exam not found');
        return data;
    }

    async createExam(input: ExamInput, creatorId: string) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exams')
            .insert([{
                ...input,
                created_by: creatorId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return data;
    }

    async updateExam(id: string, input: Partial<ExamInput>) {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('exams')
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return data;
    }

    async deleteExam(id: string) {
        const supabase = await createClient();
        const { error } = await supabase.from('exams').delete().eq('id', id);
        if (error) throw new AppError(error.message, 400);
        return true;
    }
}

export const examService = new ExamService();
