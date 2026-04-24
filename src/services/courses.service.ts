import { createClient } from '@/lib/supabase/server';
import { redisCache } from '@/lib/redis';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import type { Database } from '@/types/supabase';
import { isAlwaysPublicProgramName } from '@/lib/courses/visibility';

export interface CourseInput {
    program_id: string;
    title: string;
    description?: string;
    content?: string;
    duration_hours?: number;
    start_date?: string;
    end_date?: string;
    /** Maps to `courses.is_active` — active courses must have a programme with a positive `price` for checkout. */
    is_published?: boolean;
    level_order?: number;
    next_course_id?: string | null;
    /**
     * Soft tagging payload backed by `courses.metadata` JSONB.
     * Known keys: `grade_levels`, `subject`, `tags`. The service passes this
     * through verbatim — validation happens at the API layer.
     */
    metadata?: Record<string, unknown>;
}

export interface CourseFilters {
    schoolIds?: string[];
    programId?: string;
    page?: number;
    limit?: number;
    isPublished?: boolean;
}

type CourseInsert = Database['public']['Tables']['courses']['Insert'];
type CourseUpdate = Database['public']['Tables']['courses']['Update'];
type EnrollmentInsert = Database['public']['Tables']['enrollments']['Insert'];

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/** Active (“sellable”) courses must link to a programme with a positive price (Paystack checkout). */
async function assertActiveCourseHasPricedProgram(
    supabase: SupabaseServer,
    programId: string | null | undefined,
    isActive: boolean | null | undefined,
) {
    if (isActive !== true) return;
    if (!programId) {
        throw new AppError(
            'An active course must be linked to a programme (program_id).',
            400,
            true,
        );
    }
    const { data: prog, error } = await supabase
        .from('programs')
        .select('price, name')
        .eq('id', programId)
        .maybeSingle();
    if (error || !prog) throw new NotFoundError('Program not found');
    const price = Number(prog.price);
    if (!Number.isFinite(price) || price <= 0) {
        throw new AppError(
            `Program "${prog.name ?? programId}" must have programs.price greater than zero for paid checkout. Set a price on the programme or save the course as a draft (unpublished).`,
            400,
            true,
        );
    }
}

export class CoursesService {
    async listCourses(filters: CourseFilters = {}) {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const offset = (page - 1) * limit;

        const schoolIdsKey = filters.schoolIds ? filters.schoolIds.join(',') : 'all';
        const cacheKey = `courses:${schoolIdsKey}:p${filters.programId || 'all'}:pg${page}:l${limit}:pub${filters.isPublished}`;

        const cached = await redisCache.get<{ data: any[], metadata: any }>(cacheKey);
        if (cached) {
            return cached;
        }

        const supabase = await createClient();

        let query = supabase
            .from('courses')
            .select('*, programs!inner(id, name)', { count: 'exact' });

        if (filters.schoolIds && filters.schoolIds.length > 0) {
            query = query.or(`school_id.in.(${filters.schoolIds.join(',')}),school_id.is.null`);
        }

        if (filters.programId) {
            query = query.eq('program_id', filters.programId);
        }

        if (filters.isPublished !== undefined) {
            query = query.eq('is_active', filters.isPublished);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw new AppError(`Failed to fetch courses: ${error.message}`, 500);
        }

        const dataWithPublish = (data ?? []).map((row: any) => ({
            ...row,
            is_published: row.is_active === true,
        }));

        const result = {
            data: dataWithPublish,
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

    async getCourse(id: string, schoolIds?: string[]) {
        const supabase = await createClient();
        let query = supabase.from('courses').select('*, programs!inner(name, id)').eq('id', id);

        if (schoolIds && schoolIds.length > 0) {
            query = query.or(`school_id.in.(${schoolIds.join(',')}),school_id.is.null`);
        }

        const { data, error } = await query.single();

        if (error || !data) {
            throw new NotFoundError('Course not found');
        }

        return { ...data, is_published: data.is_active === true };
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

        // Global programs (school_id = null) can be used by any admin/teacher
        if (program.school_id && program.school_id !== tenantId) {
            throw new AppError('Program does not belong to your school', 403);
        }

        const isActive = input.is_published !== false;
        await assertActiveCourseHasPricedProgram(supabase, input.program_id, isActive);

        // Default lock policy: new courses are hidden from students until an
        // admin unlocks them, EXCEPT courses in our always-public flagship
        // programmes (Young Innovator, Teen Developer) which are always open.
        // Callers may still override by passing `is_locked` explicitly.
        const { data: programNameRow } = await supabase
            .from('programs')
            .select('name')
            .eq('id', input.program_id)
            .single();
        const isFlagship = isAlwaysPublicProgramName(programNameRow?.name);
        const explicitLock = (input as CourseInput & { is_locked?: boolean }).is_locked;
        const is_locked = typeof explicitLock === 'boolean' ? explicitLock : !isFlagship;

        const { is_published: _omit, is_locked: _omitLock, ...inputRow } = input as CourseInput & { is_published?: boolean; is_locked?: boolean };
        const insertRow: CourseInsert = {
            ...(inputRow as CourseInsert),
            school_id: tenantId,
            is_active: isActive,
            is_locked,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('courses')
            .insert([insertRow])
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
            // Programs with school_id = null are global and accessible to all tenants
            const { data: program } = await supabase.from('programs').select('school_id').eq('id', input.program_id).single();
            if (!program || (tenantId && program.school_id !== null && program.school_id !== tenantId)) {
                throw new AppError('Program not valid or access denied', 403);
            }
        }

        const { data: current } = await supabase
            .from('courses')
            .select('program_id, is_active')
            .eq('id', id)
            .single();

        const nextProgramId = input.program_id ?? current?.program_id ?? null;
        let nextActive = current?.is_active ?? true;
        if (input.is_published !== undefined) {
            nextActive = input.is_published;
        } else if ((input as CourseUpdate).is_active !== undefined) {
            nextActive = (input as CourseUpdate).is_active as boolean;
        }

        await assertActiveCourseHasPricedProgram(supabase, nextProgramId, nextActive);

        const patch: CourseUpdate = { ...(input as CourseUpdate), updated_at: new Date().toISOString() };
        if (input.is_published !== undefined) {
            patch.is_active = input.is_published;
        }
        delete (patch as Record<string, unknown>).is_published;
        delete (patch as Record<string, unknown>).start_date;
        delete (patch as Record<string, unknown>).end_date;

        const { data, error } = await supabase
            .from('courses')
            .update(patch)
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

        // Payment check for Paid Courses
        const { data: program } = await supabase
            .from('programs')
            .select('price, name')
            .eq('id', programId)
            .single();

        if (program && (program.price ?? 0) > 0) {
            // Check for a paid invoice for this student that includes the program name
            const { data: invoices } = await supabase
                .from('invoices')
                .select('items, status')
                .eq('portal_user_id', userId)
                .eq('status', 'paid');
            
            const hasPaid = invoices?.some(inv => 
                Array.isArray(inv.items) && inv.items.some((item: any) => 
                    String(item.description).toLowerCase().includes(program.name.toLowerCase())
                )
            );

            if (!hasPaid) {
                throw new AppError(`This is a paid course (${program.price}). Please pay the invoice to enroll.`, 402);
            }
        }

        const { data, error } = await supabase
            .from('enrollments')
            .insert([
                {
                    user_id: userId,
                    program_id: programId,
                    role: 'student',
                    status: 'active',
                    enrollment_date: new Date().toISOString()
                } satisfies EnrollmentInsert
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
