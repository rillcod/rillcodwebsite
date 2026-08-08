import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradingService } from '@/services/grading.service';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

const manualGradeSchema = z.object({
    scores: z.record(z.string(), z.number().finite().min(0)),
    feedback: z.string().trim().max(5000).nullable().optional(),
}).strict();

async function teacherSchoolIds(teacherId: string, fallbackSchoolId?: string | null) {
    const db = createAdminClient();
    const ids = new Set<string>();
    if (fallbackSchoolId) ids.add(fallbackSchoolId);
    const { data } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
    for (const row of data ?? []) {
        if (row.school_id) ids.add(row.school_id);
    }
    return ids;
}

async function canGradeAttempt(user: ApiContext['user'], attemptId: string) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role !== 'teacher' && user.role !== 'school') return false;

    const db = createAdminClient();
    const { data: attempt } = await db
        .from('exam_attempts')
        .select('id, exam_id, exams(created_by, course_id, courses!course_id(school_id))')
        .eq('id', attemptId)
        .maybeSingle();

    if (!attempt) return false;
    const exam = (attempt as any).exams;
    const examSchoolId = exam?.courses?.school_id as string | null;
    if (user.role === 'school') {
        return !!user.tenantId && examSchoolId === user.tenantId;
    }

    if (exam?.created_by === user.id) return true;
    const ids = await teacherSchoolIds(user.id, user.tenantId ?? null);
    return !!examSchoolId && ids.has(examSchoolId);
}

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id; // attemptId
    if (!id) throw new AppError('Attempt ID missing', 400);

    if (!ctx.user || !['admin', 'teacher', 'school'].includes(ctx.user.role)) throw new AppError('Forbidden', 403);
    if (!(await canGradeAttempt(ctx.user, id))) throw new AppError('Forbidden attempt scope', 403);

    const parsed = manualGradeSchema.safeParse(await req.json());
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || 'Invalid grading data', 400);
    const result = await gradingService.manualGrade(id, parsed.data.scores, parsed.data.feedback ?? null);
    await logAudit(createAdminClient() as any, {
        action: result.grade.status === 'graded' ? 'finalize_written_exam_grade' : 'save_written_exam_review',
        actorId: ctx.user.id,
        resourceType: 'exam_attempt',
        resourceId: id,
        tableName: 'exam_attempts',
        oldValues: {
            score: result.previousScore,
            status: result.previousStatus,
            manual_questions_scored: Object.keys(result.previous.manual_scores).length,
        },
        newValues: {
            score: result.grade.score,
            total_points: result.grade.totalPoints,
            percentage: result.grade.percentage,
            status: result.grade.status,
            manual_questions_scored: Object.keys(result.grade.manualScores).length,
            manual_questions_total: result.grade.manualQuestionIds.length,
            feedback_updated: parsed.data.feedback !== undefined,
        },
    });

    return NextResponse.json({
        success: true,
        message: result.grade.status === 'graded' ? 'Grade published and student notified' : 'Review progress saved',
        data: { status: result.grade.status, score: result.grade.score, percentage: result.grade.percentage },
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
