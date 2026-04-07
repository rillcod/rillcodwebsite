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
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) throw new NotFoundError('Exam not found');

        let courseData = null;
        if (data.course_id) {
            const { data: cData } = await supabase
                .from('courses')
                .select('school_id')
                .eq('id', data.course_id)
                .single();
            courseData = cData;
        }

        return {
            ...data,
            courses: courseData
        };
    }

    async createExam(input: ExamInput, creatorId: string) {
        const supabase = await createClient();
        const { tenant_id, ...payload } = input as any;
        const { data, error } = await supabase
            .from('exams')
            .insert([{
                ...payload,
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
        const { tenant_id, ...payload } = input as any;
        const { data, error } = await supabase
            .from('exams')
            .update({
                ...payload,
                updated_at: new Date().toISOString()
            } as any)
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
