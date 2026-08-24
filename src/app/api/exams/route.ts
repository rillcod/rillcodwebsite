import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';
import {
    assessmentVisibleToStudent,
    loadAssessmentStudentProfile,
} from '@/lib/academic/assessment-visibility';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';

const examSchema = z.object({
    course_id: z.string().uuid(),
    class_id: z.string().uuid().nullable().optional(),
    assessment_scope: z.enum(['class_result', 'practice']),
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000).optional(),
    duration_minutes: z.number().int().min(1).max(600),
    total_points: z.number().int().min(1).max(10_000).default(100),
    passing_score: z.number().min(0).max(100).default(70),
    randomize_questions: z.boolean().default(true),
    randomize_options: z.boolean().default(true),
    max_attempts: z.number().int().min(1).max(10).default(1),
    is_active: z.boolean().default(false),
}).strict();

async function courseIdsForSchools(schoolIds: string[]): Promise<string[]> {
    if (!schoolIds.length) return [];
    const { data, error } = await createAdminClient().from('courses').select('id').in('school_id', schoolIds);
    if (error) throw new AppError(error.message, 500);
    return (data ?? []).map((course) => course.id);
}

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId') || undefined;

    // Students (and other non-staff) only see exams for courses in the programmes
    // they're ENROLLED in — the same gate assignments use. Staff are school-scoped.
    const role = ctx.user?.role;
    let exams;
    if (role === 'student' && ctx.user?.id) {
        const admin = createAdminClient();
        const student = await loadAssessmentStudentProfile(admin as any, ctx.user.id);
        if (!student) throw new AppError('Learner profile not found', 404);
        const scope = await resolveStudentProgramScope(admin as any, ctx.user.id, student.class_id);
        exams = await examService.listExams(courseId, undefined, Array.from(scope.courseIds));
        exams = exams.filter((exam) => exam.is_active && assessmentVisibleToStudent(exam, student, scope));
    } else if (role === 'teacher' && ctx.user?.id) {
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        exams = await examService.listExams(courseId, undefined, await courseIdsForSchools(schoolIds));
    } else if (role === 'school') {
        if (!ctx.user?.tenantId) throw new AppError('School account is not linked to a tenant', 403);
        exams = await examService.listExams(courseId, ctx.user?.tenantId);
    } else if (role === 'admin') {
        exams = await examService.listExams(courseId);
    } else {
        throw new AppError('Academic staff or student access required', 403);
    }
    return NextResponse.json({ success: true, data: exams });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user || !['admin', 'teacher'].includes(ctx.user.role)) throw new AppError('Teachers and Admins only', 403);

    const { data, errorResponse } = await withValidation(req as any, examSchema);
    if (errorResponse) return errorResponse;
    if (data!.is_active) throw new AppError('Create the written exam as a draft, add and validate its questions, then activate it.', 422);

    const db = createAdminClient();
    const { data: course, error: courseError } = await db
        .from('courses')
        .select('id,school_id,program_id')
        .eq('id', data!.course_id)
        .maybeSingle();
    if (courseError || !course) throw new AppError(courseError?.message || 'Course not found', 400);

    if (ctx.user.role === 'teacher') {
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        if (!course?.school_id || !schoolIds.includes(course.school_id)) {
            throw new AppError('You can only create written exams for courses in your assigned schools.', 403);
        }
    }

    if (data!.assessment_scope === 'class_result' && !data!.class_id) {
        throw new AppError(
            'Choose the class whose report should receive this exam, or switch it to Practice only.',
            400,
            true,
            { code: 'CLASS_REQUIRED_FOR_RESULT' },
        );
    }

    const { data: targetClass, error: classError } = data!.class_id
        ? await db.from('classes')
            .select('id,name,teacher_id,school_id,program_id,term_id,academic_offering_id,offering_period_id')
            .eq('id', data!.class_id)
            .maybeSingle()
        : { data: null, error: null };
    if (classError) throw new AppError(classError.message, 500);
    if (data!.class_id && !targetClass) throw new AppError('Target class not found', 400);
    if (targetClass) {
        if (ctx.user.role === 'teacher' && targetClass.teacher_id !== ctx.user.id) {
            throw new AppError('You can only create written exams for classes you own.', 403);
        }
        if (course.school_id && targetClass.school_id !== course.school_id) {
            throw new AppError('The selected class and course belong to different schools.', 409);
        }
        if (course.program_id && targetClass.program_id && targetClass.program_id !== course.program_id) {
            throw new AppError('The selected class and course belong to different programmes.', 409);
        }
        if (data!.assessment_scope === 'class_result'
            && (!targetClass.academic_offering_id || !targetClass.offering_period_id)) {
            throw new AppError(
                'This class is not connected to an academic offering and reporting period. Repair the class setup before publishing result-bearing work.',
                409,
                true,
                { code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE' },
            );
        }
    }

    const { assessment_scope: assessmentScope, class_id: requestedClassId, ...definition } = data!;
    const classId = targetClass?.id ?? requestedClassId ?? null;
    const exam = await examService.createExam({
        ...definition,
        class_id: classId,
        program_id: targetClass?.program_id ?? course.program_id ?? null,
        term_id: targetClass?.term_id ?? null,
        academic_offering_id: targetClass?.academic_offering_id ?? null,
        offering_period_id: targetClass?.offering_period_id ?? null,
        metadata: {
            assessment_scope: assessmentScope,
            result_eligible: assessmentScope === 'class_result',
            ...(classId ? { target_class_id: classId, visibility: 'class' } : {}),
        },
    }, ctx.user.id);
    await logAudit(createAdminClient() as any, {
        action: 'create_written_exam', actorId: ctx.user.id,
        resourceType: 'exam', resourceId: exam.id, tableName: 'exams',
        newValues: { course_id: exam.course_id, class_id: exam.class_id, assessment_scope: assessmentScope, title: exam.title, duration_minutes: exam.duration_minutes, total_points: exam.total_points, passing_score: exam.passing_score },
    });
    return NextResponse.json({ success: true, data: exam });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
