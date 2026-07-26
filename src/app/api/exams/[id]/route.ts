import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

async function canAccessExam(ctx: ApiContext, examId: string, mode: 'read' | 'write') {
    if (!ctx.user) return false;
    if (ctx.user.role === 'admin') return true;
    const db = createAdminClient();
    const { data: exam } = await db
        .from('exams')
        .select('id, created_by, courses!course_id(school_id)')
        .eq('id', examId)
        .maybeSingle();
    if (!exam) return false;
    const schoolId = (exam as any)?.courses?.school_id as string | null;
    if (ctx.user.role === 'student') {
        return mode === 'read' && !!ctx.user.tenantId && !!schoolId && ctx.user.tenantId === schoolId;
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

    const body = await req.json();
    const exam = await examService.updateExam(id, body);
    return NextResponse.json({ success: true, data: exam });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (!(await canAccessExam(ctx, id, 'write'))) throw new AppError('Forbidden', 403);

    await examService.deleteExam(id);
    return NextResponse.json({ success: true, message: 'Exam deleted' });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
