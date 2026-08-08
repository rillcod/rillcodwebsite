import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';

const examSchema = z.object({
    course_id: z.string().uuid(),
    title: z.string().trim().min(3).max(200),
    description: z.string().max(5000).optional(),
    duration_minutes: z.number().int().min(1).max(600),
    total_points: z.number().int().min(1).max(10_000).default(100),
    passing_score: z.number().min(0).max(100).default(70),
    randomize_questions: z.boolean().default(true),
    randomize_options: z.boolean().default(true),
    max_attempts: z.number().int().min(1).max(10).default(1),
    is_active: z.boolean().default(true),
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
        const { resolveStudentProgramScope } = await import('@/lib/assignments/visibility');
        const scope = await resolveStudentProgramScope(createAdminClient() as any, ctx.user.id);
        exams = await examService.listExams(courseId, undefined, Array.from(scope.courseIds));
    } else if (role === 'teacher' && ctx.user?.id) {
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        exams = await examService.listExams(courseId, undefined, await courseIdsForSchools(schoolIds));
    } else if (role === 'school') {
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

    if (ctx.user.role === 'teacher') {
        const db = createAdminClient();
        const { data: course } = await db.from('courses').select('school_id').eq('id', data!.course_id).maybeSingle();
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        if (!course?.school_id || !schoolIds.includes(course.school_id)) {
            throw new AppError('You can only create written exams for courses in your assigned schools.', 403);
        }
    }
    const exam = await examService.createExam(data!, ctx.user.id);
    await logAudit(createAdminClient() as any, {
        action: 'create_written_exam', actorId: ctx.user.id,
        resourceType: 'exam', resourceId: exam.id, tableName: 'exams',
        newValues: { course_id: exam.course_id, title: exam.title, duration_minutes: exam.duration_minutes, total_points: exam.total_points, passing_score: exam.passing_score },
    });
    return NextResponse.json({ success: true, data: exam });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
