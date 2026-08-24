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

    // Use the same school/programme/class rule as list and detail. An official
    // class paper must never be startable by a learner from a neighbouring class.
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { resolveStudentProgramScope } = await import('@/lib/assignments/visibility');
    const { assessmentVisibleToStudent, loadAssessmentStudentProfile } = await import('@/lib/academic/assessment-visibility');
    const admin = createAdminClient();
    const { data: exam, error: examError } = await admin
        .from('exams')
        .select('id,course_id,program_id,class_id,school_id,metadata,is_active')
        .eq('id', id)
        .maybeSingle();
    if (examError) throw new AppError(examError.message, 500);
    if (!exam || !exam.is_active) throw new AppError('This exam is not available.', 404);
    const student = await loadAssessmentStudentProfile(admin as any, ctx.user!.id);
    if (!student) throw new AppError('Learner profile not found', 404);
    const scope = await resolveStudentProgramScope(admin as any, ctx.user!.id, student.class_id);
    if (!assessmentVisibleToStudent(exam, student, scope)) {
        throw new AppError('This exam is not assigned to your school, programme and class.', 403);
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
