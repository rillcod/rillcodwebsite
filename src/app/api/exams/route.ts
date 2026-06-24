import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const examSchema = z.object({
    course_id: z.string().uuid(),
    title: z.string().min(3),
    description: z.string().optional(),
    duration_minutes: z.number().int().positive(),
    total_points: z.number().int().positive().default(100),
    passing_score: z.number().int().positive().default(70),
    randomize_questions: z.boolean().default(true),
    randomize_options: z.boolean().default(true),
    max_attempts: z.number().int().positive().default(1),
    is_active: z.boolean().default(true),
});

async function listHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId') || undefined;

    // Students (and other non-staff) only see exams for courses in the programmes
    // they're ENROLLED in — the same gate assignments use. Staff are school-scoped.
    const role = ctx.user?.role;
    const isStaff = role === 'admin' || role === 'teacher' || role === 'school';
    let exams;
    if (!isStaff && ctx.user?.id) {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { resolveStudentProgramScope } = await import('@/lib/assignments/visibility');
        const scope = await resolveStudentProgramScope(createAdminClient() as any, ctx.user.id);
        exams = await examService.listExams(courseId, undefined, Array.from(scope.courseIds));
    } else {
        exams = await examService.listExams(courseId, ctx.user?.tenantId);
    }
    return NextResponse.json({ success: true, data: exams });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role === 'student') throw new AppError('Teachers and Admins only', 403);

    const { data, errorResponse } = await withValidation(req as any, examSchema);
    if (errorResponse) return errorResponse;

    const exam = await examService.createExam(data!, ctx.user!.id);
    return NextResponse.json({ success: true, data: exam });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
