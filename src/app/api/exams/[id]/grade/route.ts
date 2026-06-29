import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { gradingService } from '@/services/grading.service';
import { AppError } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

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

    if (ctx.user?.role === 'student') throw new AppError('Forbidden', 403);
    if (!(await canGradeAttempt(ctx.user, id))) throw new AppError('Forbidden attempt scope', 403);

    const { scores, feedback } = await req.json();
    const result = await gradingService.manualGrade(id, scores, feedback);

    return NextResponse.json({ success: true, message: 'Grading updated and student notified' });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
