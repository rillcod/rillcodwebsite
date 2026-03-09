import { createClient } from '@/lib/supabase/server';
import { redisCache } from '@/lib/redis';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';

export interface CourseInput {
    program_id: string;
    title: string;
    description?: string;
    content?: string;
    duration_hours?: number;
    start_date?: string;
    end_date?: string;
    is_published?: boolean;
}

export interface CourseFilters {
    tenantId?: string;
    programId?: string;
    page?: number;
    limit?: number;
    isPublished?: boolean;
}

export class CoursesService {
    async listCourses(filters: CourseFilters = {}) {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const offset = (page - 1) * limit;

        const cacheKey = `courses:${filters.tenantId || 'all'}:p${filters.programId || 'all'}:pg${page}:l${limit}:pub${filters.isPublished}`;

        const cached = await redisCache.get<{ data: any[], metadata: any }>(cacheKey);
        if (cached) {
            return cached;
        }

        const supabase = await createClient();

        let query = supabase
            .from('courses')
            .select('*, programs!inner(name)', { count: 'exact' });

        if (filters.tenantId) {
            query = query.eq('school_id', filters.tenantId);
        }

        if (filters.programId) {
            query = query.eq('program_id', filters.programId);
        }

        if (filters.isPublished !== undefined) {
            query = query.eq('is_published', filters.isPublished);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new AppError(`Failed to fetch courses: ${error.message}`, 500);
        }

        const result = {
            data,
            metadata: {
                total: count || 0,
                page,
                limit,
                totalPages: count ? Math.ceil(count / limit) : 0,
            }
        };

        await redisCache.set(cacheKey, result, 300);
        return result;
    }

    async getCourse(id: string, tenantId?: string) {
        const supabase = await createClient();
        let query = supabase.from('courses').select('*, programs!inner(name, id)').eq('id', id);

        if (tenantId) {
            query = query.eq('school_id', tenantId);
        }

        const { data, error } = await query.single();

        if (error || !data) {
            throw new NotFoundError('Course not found');
        }

        return data;
    }

    async createCourse(input: CourseInput, tenantId: string) {
        const supabase = await createClient();

        // Verify program belongs to tenant
        const { data: program, error: programErr } = await supabase
            .from('programs')
            .select('id, school_id')
            .eq('id', input.program_id)
            .single();

        if (programErr || !program) {
            throw new NotFoundError('Program not found');
        }

        if (program.school_id !== tenantId) {
            throw new AppError('Program does not belong to your school', 403);
        }

        const { data, error } = await supabase
            .from('courses')
            .insert([
                {
                    ...input,
                    school_id: tenantId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            ])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to create course: ${error.message}`, 400);
        }

        return data;
    }

    async updateCourse(id: string, input: Partial<CourseInput>, tenantId?: string) {
        const supabase = await createClient();

        await this.getCourse(id, tenantId);

        if (input.program_id) {
            // Check if new program belongs to tenant
            const { data: program } = await supabase.from('programs').select('school_id').eq('id', input.program_id).single();
            if (!program || (tenantId && program.school_id !== tenantId)) {
                throw new AppError('Program not valid or access denied', 403);
            }
        }

        const { data, error } = await supabase
            .from('courses')
            .update({
                ...input,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to update course: ${error.message}`, 400);
        }

        return data;
    }

    async deleteCourse(id: string, tenantId?: string) {
        const supabase = await createClient();

        await this.getCourse(id, tenantId);

        const { error } = await supabase
            .from('courses')
            .delete()
            .eq('id', id);

        if (error) {
            throw new AppError(`Failed to delete course: ${error.message}`, 400);
        }

        return true;
    }

    async enrollCourse(courseId: string, userId: string, tenantId?: string) {
        const supabase = await createClient();
        const course = await this.getCourse(courseId, tenantId);

        // Note: Enrollments exist on the Program level in the schema originally!
        // `enrollments` table: id, user_id, program_id, status, enrollment_date.
        // So enrolling into a course inherently means enrolling into its parent program if not already enrolled.
        // We will enroll them in the program.

        if (!course.program_id) {
            throw new AppError('Course does not have an associated program', 400);
        }

        const programId: string = course.program_id;

        const { data: existingEnrollment } = await supabase
            .from('enrollments')
            .select('id')
            .eq('user_id', userId)
            .eq('program_id', programId)
            .maybeSingle();

        if (existingEnrollment) {
            throw new AppError('User is already enrolled in this course/program', 400);
        }

        // TODO: Payment check for Paid Courses

        const { data, error } = await supabase
            .from('enrollments')
            .insert([
                {
                    user_id: userId,
                    program_id: programId,
                    status: 'active',
                    enrollment_date: new Date().toISOString()
                } as any
            ])
            .select()
            .single();

        if (error) {
            throw new AppError(`Failed to enroll: ${error.message}`, 500);
        }
        return data;
    }

    async unenrollCourse(courseId: string, userId: string, tenantId?: string) {
        const supabase = await createClient();
        const course = await this.getCourse(courseId, tenantId);

        if (!course.program_id) {
            throw new AppError('Course does not have an associated program', 400);
        }

        const { error } = await supabase
            .from('enrollments')
            .delete()
            .eq('user_id', userId)
            .eq('program_id', course.program_id as string);

        if (error) {
            throw new AppError(`Failed to unenroll: ${error.message}`, 500);
        }

        return true;
    }
}

export const coursesService = new CoursesService();
