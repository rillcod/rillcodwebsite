import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { examTakingService } from '@/services/exam-taking.service';
import { AppError } from '@/lib/errors';
import { logAudit } from '@/lib/audit/log';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Exam ID missing', 400);

    if (ctx.user?.role !== 'student') {
        throw new AppError('Only students can take exams', 403);
    }

    // Gate by programme enrolment: the exam's course must belong to a programme the
    // student is enrolled in (defence-in-depth — same rule as the list + assignments).
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { resolveStudentProgramScope } = await import('@/lib/assignments/visibility');
    const admin = createAdminClient();
    const { data: exam } = await admin.from('exams').select('course_id').eq('id', id).maybeSingle();
    const examCourseId = (exam as any)?.course_id ?? null;
    const scope = await resolveStudentProgramScope(admin as any, ctx.user!.id);
    if (!examCourseId || !scope.courseIds.has(examCourseId)) {
        throw new AppError('This exam is not part of your enrolled programme.', 403);
    }

    // Attendance-eligibility gate ("lms_attendance_threshold"). Fails open when the policy
    // is 0/unset, so it never wrongly blocks a student.
    const { checkExamAttendanceEligibility } = await import('@/lib/server/attendance');
    const att = await checkExamAttendanceEligibility(admin as any, ctx.user!.id);
    if (!att.eligible) {
        throw new AppError(
            `You need at least ${att.threshold}% class attendance to sit this exam (you're at ${att.pct}%). Please attend more live classes.`,
            403,
        );
    }

    const session = await examTakingService.startExam(id, ctx.user!.id);
    await logAudit(admin as any, {
        action: session.resumed ? 'resume_written_exam_attempt' : 'start_written_exam_attempt', actorId: ctx.user!.id,
        resourceType: 'exam_attempt', resourceId: session.attemptId,
        tableName: 'exam_attempts', newValues: { exam_id: id },
    });
    return NextResponse.json({ success: true, data: session });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
