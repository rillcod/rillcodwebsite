import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examTakingService } from '@/services/exam-taking.service';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (ctx.user?.role !== 'student') {
        throw new AppError('Only students can take exams', 403);
    }

    const session = await examTakingService.startExam(id, ctx.user!.id);
    return NextResponse.json({ success: true, data: session });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
