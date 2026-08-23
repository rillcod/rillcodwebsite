import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, NotFoundError } from '@/lib/errors';
import type { Database } from '@/types/supabase';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';

export interface ExamInput {
    course_id: string;
    title: string;
    description?: string | null;
    duration_minutes: number;
    total_points?: number;
    passing_score?: number;
    randomize_questions?: boolean;
    randomize_options?: boolean;
    max_attempts?: number;
    is_active?: boolean;
}

type ExamInsert = Database['public']['Tables']['exams']['Insert'];
type ExamUpdate = Database['public']['Tables']['exams']['Update'];

export class ExamService {
    /**
     * @param allowedCourseIds when provided, restricts exams to these course ids.
     *   Used to gate students to the courses in their ENROLLED programmes (the same
     *   programme/course scope assignments use). An empty array → no exams.
     */
    async listExams(courseId?: string, tenantId?: string, allowedCourseIds?: string[]) {
        const supabase = createAdminClient();
        let query = supabase.from('exams').select('*, courses!course_id(id,title,school_id)');

        let scopedCourseIds = allowedCourseIds ? [...new Set(allowedCourseIds)] : null;
        if (tenantId) {
            const { data: tenantCourses, error: courseError } = await supabase
                .from('courses')
                .select('id')
                .eq('school_id', tenantId);
            if (courseError) throw new AppError(courseError.message, 500);
            const tenantCourseIds = new Set((tenantCourses ?? []).map((course) => course.id));
            scopedCourseIds = scopedCourseIds
                ? scopedCourseIds.filter((id) => tenantCourseIds.has(id))
                : [...tenantCourseIds];
        }

        if (courseId) {
            if (scopedCourseIds && !scopedCourseIds.includes(courseId)) return [];
            query = query.eq('course_id', courseId);
        }

        if (scopedCourseIds) {
            if (scopedCourseIds.length === 0) return [];
            query = query.in('course_id', scopedCourseIds);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new AppError(error.message, 500);
        return data;
    }

    async getExam(id: string) {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('exams')
            .select('*, courses!course_id(id,title,school_id)')
            .eq('id', id)
            .single();

        if (error || !data) throw new NotFoundError('Exam not found');
        return data;
    }

    async createExam(input: ExamInput, creatorId: string) {
        const supabase = createAdminClient();
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id,school_id')
            .eq('id', input.course_id)
            .maybeSingle();
        if (courseError || !course) throw new AppError(courseError?.message || 'Course not found', 400);
        const payload: ExamInsert = {
            course_id: input.course_id,
            title: input.title,
            description: input.description,
            duration_minutes: input.duration_minutes,
            total_points: input.total_points,
            passing_score: input.passing_score,
            randomize_questions: input.randomize_questions,
            randomize_options: input.randomize_options,
            max_attempts: input.max_attempts,
            is_active: input.is_active,
            school_id: course.school_id ?? null,
        };

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
        const supabase = createAdminClient();
        const payload: ExamUpdate = {
            course_id: input.course_id,
            title: input.title,
            description: input.description,
            duration_minutes: input.duration_minutes,
            total_points: input.total_points,
            passing_score: input.passing_score,
            randomize_questions: input.randomize_questions,
            randomize_options: input.randomize_options,
            max_attempts: input.max_attempts,
            is_active: input.is_active
        };
        if (input.course_id) {
            const { data: course, error: courseError } = await supabase
                .from('courses')
                .select('school_id')
                .eq('id', input.course_id)
                .maybeSingle();
            if (courseError || !course) throw new AppError(courseError?.message || 'Course not found', 400);
            payload.school_id = course.school_id ?? null;
        }

        const { data, error } = await supabase
            .from('exams')
            .update({
                ...payload,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new AppError(error.message, 400);
        return data;
    }

    async deleteExam(id: string) {
        const supabase = createAdminClient();
        const { count, error: attemptError } = await supabase
            .from('exam_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('exam_id', id);
        if (attemptError) throw new AppError(attemptError.message, 500);
        if ((count ?? 0) > 0) {
            throw new AppError('This exam has learner attempts and cannot be deleted. Deactivate it instead.', 409);
        }
        const cleanupPolicy = await loadCleanupPolicy(supabase as any);
        if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
            throw new AppError(STRICT_CLEANUP_MESSAGE, 409);
        }
        const { error } = await supabase.from('exams').delete().eq('id', id);
        if (error) throw new AppError(error.message, 400);
        return true;
    }
}

export const examService = new ExamService();
