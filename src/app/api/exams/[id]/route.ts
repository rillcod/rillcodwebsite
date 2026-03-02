import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examService } from '@/services/exam.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    const exam = await examService.getExam(id);

    // Basic tenant check
    if (ctx.user?.role === 'student' && exam.courses?.school_id !== ctx.user.tenantId) {
        throw new AppError('Access denied to this exam', 403);
    }

    return NextResponse.json({ success: true, data: exam });
}

async function putHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    const body = await req.json();
    const exam = await examService.updateExam(id, body);
    return NextResponse.json({ success: true, data: exam });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);

    await examService.deleteExam(id);
    return NextResponse.json({ success: true, message: 'Exam deleted' });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler)(req, ctx);
