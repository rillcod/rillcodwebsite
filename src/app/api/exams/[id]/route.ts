import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';
import { logAudit } from '@/lib/audit/log';
import { z } from 'zod';
import { writtenPaperDefinitionError } from '@/lib/exams/question-validation';

const examUpdateSchema = z.object({
    course_id: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    duration_minutes: z.number().int().min(1).max(600).optional(),
    total_points: z.number().int().min(1).max(10_000).optional(),
    passing_score: z.number().min(0).max(100).optional(),
    randomize_questions: z.boolean().optional(),
    randomize_options: z.boolean().optional(),
    max_attempts: z.number().int().min(1).max(10).optional(),
    is_active: z.boolean().optional(),
}).strict();

async function canAccessExam(ctx: ApiContext, examId: string, mode: 'read' | 'write') {
    if (!ctx.user) return false;
    if (ctx.user.role === 'admin') return true;
    const db = createAdminClient();
    const { data: exam } = await db
        .from('exams')
        .select('id, created_by, course_id, school_id, courses!course_id(school_id)')
        .eq('id', examId)
        .maybeSingle();
    if (!exam) return false;
    const schoolId = (exam as any)?.courses?.school_id as string | null;
    if (ctx.user.role === 'student') {
        if (mode !== 'read' || !exam.course_id) return false;
        const scope = await resolveStudentProgramScope(db as any, ctx.user.id);
        return scope.courseIds.has(exam.course_id);
    }
    if (ctx.user.role === 'teacher') {
        if ((exam as any).created_by === ctx.user.id) return true;
        const teacherSchoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        return !!schoolId && teacherSchoolIds.includes(schoolId);
    }
    if (ctx.user.role === 'school') {
        if (mode === 'write') return false;
        return !!ctx.user.tenantId && !!schoolId && ctx.user.tenantId === schoolId;
    }
    return false;
}

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    const exam = await examService.getExam(id);

    if (!(await canAccessExam(ctx, id, 'read'))) throw new AppError('Access denied to this exam', 403);

    return NextResponse.json({ success: true, data: exam });
}

async function putHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (!(await canAccessExam(ctx, id, 'write'))) throw new AppError('Forbidden', 403);

    const parsed = examUpdateSchema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid exam update', 400);
    const body = parsed.data;
    const db = createAdminClient();
    const { count: attemptCount, error: attemptError } = await db
        .from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', id);
    if (attemptError) throw new AppError(attemptError.message, 500);
    if ((attemptCount ?? 0) > 0 && Object.keys(body).some((key) => key !== 'is_active')) {
        throw new AppError('This exam has learner attempts. Only its active status can be changed; the assessment definition is locked.', 409);
    }
    if (body.is_active === true) {
        const { data: questions, error: questionError } = await db.from('exam_questions').select('id,question_type,points,options,correct_answer').eq('exam_id', id);
        if (questionError) throw new AppError(questionError.message, 500);
        const definitionError = writtenPaperDefinitionError(questions ?? []);
        if (definitionError) throw new AppError(definitionError, 422);
    }
    if (ctx.user?.role === 'teacher' && body.course_id) {
        const { data: course } = await db.from('courses').select('school_id').eq('id', body.course_id).maybeSingle();
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        if (!course?.school_id || !schoolIds.includes(course.school_id)) {
            throw new AppError('You can only move an exam to a course in your assigned schools.', 403);
        }
    }
    const { data: before } = await db.from('exams').select('course_id,title,duration_minutes,total_points,passing_score,is_active').eq('id', id).maybeSingle();
    const exam = await examService.updateExam(id, body);
    await logAudit(db as any, {
        action: 'update_written_exam', actorId: ctx.user?.id,
        resourceType: 'exam', resourceId: id, tableName: 'exams',
        oldValues: before ?? null, newValues: body,
    });
    return NextResponse.json({ success: true, data: exam });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (!(await canAccessExam(ctx, id, 'write'))) throw new AppError('Forbidden', 403);

    const db = createAdminClient();
    const { data: before } = await db.from('exams').select('course_id,title,is_active').eq('id', id).maybeSingle();
    await examService.deleteExam(id);
    await logAudit(db as any, {
        action: 'delete_unattempted_written_exam', actorId: ctx.user?.id,
        resourceType: 'exam', resourceId: id, tableName: 'exams',
        oldValues: before ?? null, newValue: 'Deleted written exam with no learner attempts',
    });
    return NextResponse.json({ success: true, message: 'Exam deleted' });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
