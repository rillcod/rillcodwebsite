import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradingService } from '@/services/grading.service';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

const answersSchema = z.record(z.string().max(100), z.unknown())
    .refine(value => Object.keys(value).length <= 1000, 'Too many answers')
    .refine(value => JSON.stringify(value).length <= 1_000_000, 'Answer payload is too large');

const submissionSchema = z.object({
    attemptId: z.string().uuid(),
    answers: answersSchema,
}).strict();

async function postHandler(req: Request, ctx: ApiContext) {
    const examId = ctx.params?.id;
    if (!examId) throw new AppError('Exam ID missing', 400);
    if (ctx.user?.role !== 'student') throw new AppError('Only students can submit exams', 403);
    const parsed = submissionSchema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid submission', 400);

    const { attemptId, answers } = parsed.data;
    const result = await gradingService.submitExam(examId, attemptId, ctx.user.id, answers);
    await logAudit(createAdminClient() as any, {
        action: 'submit_written_exam_attempt',
        actorId: ctx.user.id,
        resourceType: 'exam_attempt',
        resourceId: attemptId,
        tableName: 'exam_attempts',
        newValues: {
            exam_id: examId,
            status: result.grade.status,
            score: result.grade.score,
            total_points: result.grade.totalPoints,
            expired_submission: result.expired,
            requires_manual_grading: result.grade.status === 'submitted',
        },
    });
    return NextResponse.json({ success: true, data: result });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
