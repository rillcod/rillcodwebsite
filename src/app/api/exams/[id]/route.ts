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
import {
    assessmentVisibleToStudent,
    loadAssessmentStudentProfile,
} from '@/lib/academic/assessment-visibility';

const examUpdateSchema = z.object({
    course_id: z.string().uuid().optional(),
    class_id: z.string().uuid().nullable().optional(),
    assessment_scope: z.enum(['class_result', 'practice']).optional(),
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
        .select('id, created_by, course_id, program_id, class_id, school_id, metadata, is_active, courses!course_id(school_id)')
        .eq('id', examId)
        .maybeSingle();
    if (!exam) return false;
    const schoolId = (exam as any)?.courses?.school_id as string | null;
    if (ctx.user.role === 'student') {
        if (mode !== 'read' || !exam.course_id || !exam.is_active) return false;
        const student = await loadAssessmentStudentProfile(db as any, ctx.user.id);
        if (!student) return false;
        const scope = await resolveStudentProgramScope(db as any, ctx.user.id, student.class_id);
        return assessmentVisibleToStudent(exam, student, scope);
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
    const { data: existing, error: existingError } = await db
        .from('exams')
        .select('course_id,class_id,program_id,school_id,term_id,academic_offering_id,offering_period_id,metadata,title,duration_minutes,total_points,passing_score,is_active')
        .eq('id', id)
        .maybeSingle();
    if (existingError) throw new AppError(existingError.message, 500);
    if (!existing) throw new AppError('Exam not found', 404);

    const { count: attemptCount, error: attemptError } = await db
        .from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', id);
    if (attemptError) throw new AppError(attemptError.message, 500);

    const requestedClassId = body.class_id !== undefined ? body.class_id : existing.class_id;
    const changesClassLink = requestedClassId !== existing.class_id;
    const isClassRecovery = !existing.class_id && !!requestedClassId;
    const definitionFields = [
        'course_id', 'title', 'description', 'duration_minutes', 'total_points',
        'passing_score', 'randomize_questions', 'randomize_options', 'max_attempts',
    ];
    if ((attemptCount ?? 0) > 0 && (
        definitionFields.some((field) => field in body)
        || (changesClassLink && !isClassRecovery)
    )) {
        throw new AppError(
            'This exam has protected learner attempts. You can deactivate it or repair its result use, but the paper and recorded attempts cannot be replaced.',
            409,
            true,
            { code: 'PROTECTED_ACADEMIC_EVIDENCE' },
        );
    }

    const existingMetadata = existing.metadata && typeof existing.metadata === 'object'
        && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {};
    const storedScope = existingMetadata.assessment_scope === 'practice'
        || existingMetadata.result_eligible === false
        ? 'practice'
        : existingMetadata.assessment_scope === 'class_result' || existing.class_id
            ? 'class_result'
            : null;
    const assessmentScope = body.assessment_scope ?? storedScope;
    if ((body.class_id !== undefined || body.assessment_scope !== undefined) && !assessmentScope) {
        throw new AppError('Choose whether this exam is a Class result or Practice only.', 400);
    }
    if (assessmentScope === 'class_result' && !requestedClassId) {
        throw new AppError(
            'Choose the class whose report should receive this exam, or switch it to Practice only.',
            400,
            true,
            { code: 'CLASS_REQUIRED_FOR_RESULT' },
        );
    }
    if (body.is_active === true && !assessmentScope) {
        throw new AppError('Resolve whether this legacy exam is a Class result or Practice only before activating it.', 409);
    }

    const effectiveCourseId = body.course_id ?? existing.course_id;
    if (!effectiveCourseId) throw new AppError('A course is required for this exam.', 400);
    const { data: course, error: courseError } = await db
        .from('courses')
        .select('id,school_id,program_id')
        .eq('id', effectiveCourseId)
        .maybeSingle();
    if (courseError || !course) throw new AppError(courseError?.message || 'Course not found', 400);
    if (ctx.user?.role === 'teacher') {
        const schoolIds = await getTeacherSchoolIds(ctx.user.id, ctx.user.tenantId ?? null);
        if (!course.school_id || !schoolIds.includes(course.school_id)) {
            throw new AppError('You can only use courses in your assigned schools.', 403);
        }
    }

    const { data: targetClass, error: classError } = requestedClassId
        ? await db.from('classes')
            .select('id,teacher_id,school_id,program_id,term_id,academic_offering_id,offering_period_id')
            .eq('id', requestedClassId)
            .maybeSingle()
        : { data: null, error: null };
    if (classError) throw new AppError(classError.message, 500);
    if (requestedClassId && !targetClass) throw new AppError('Target class not found', 400);
    if (targetClass) {
        if (ctx.user?.role === 'teacher' && targetClass.teacher_id !== ctx.user.id) {
            throw new AppError('You can only link written exams to classes you own.', 403);
        }
        if (course.school_id && targetClass.school_id !== course.school_id) {
            throw new AppError('The selected class and course belong to different schools.', 409, true, { code: 'CLASS_CONTEXT_MISMATCH' });
        }
        if (course.program_id && targetClass.program_id && targetClass.program_id !== course.program_id) {
            throw new AppError('The selected class and course belong to different programmes.', 409, true, { code: 'CLASS_CONTEXT_MISMATCH' });
        }
        if (assessmentScope === 'class_result'
            && (!targetClass.academic_offering_id || !targetClass.offering_period_id)) {
            throw new AppError(
                'This class is not connected to an academic offering and reporting period. Repair the class setup before linking official results.',
                409,
                true,
                { code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE' },
            );
        }
    }

    if (body.is_active === true) {
        const { data: questions, error: questionError } = await db.from('exam_questions').select('id,question_type,points,options,correct_answer').eq('exam_id', id);
        if (questionError) throw new AppError(questionError.message, 500);
        const definitionError = writtenPaperDefinitionError(questions ?? []);
        if (definitionError) throw new AppError(definitionError, 422);
    }

    const { assessment_scope: _assessmentScope, ...definitionUpdate } = body;
    const update = { ...definitionUpdate } as Parameters<typeof examService.updateExam>[1];
    if (body.assessment_scope !== undefined || body.class_id !== undefined) {
        const metadata = { ...existingMetadata };
        delete metadata.assessment_scope;
        delete metadata.result_eligible;
        delete metadata.target_class_id;
        if (metadata.visibility === 'class') delete metadata.visibility;
        update.class_id = requestedClassId ?? null;
        update.school_id = targetClass?.school_id ?? course.school_id ?? null;
        update.program_id = targetClass?.program_id ?? course.program_id ?? null;
        update.term_id = targetClass?.term_id ?? null;
        update.academic_offering_id = targetClass?.academic_offering_id ?? null;
        update.offering_period_id = targetClass?.offering_period_id ?? null;
        update.metadata = {
            ...metadata,
            assessment_scope: assessmentScope,
            result_eligible: assessmentScope === 'class_result',
            ...(requestedClassId ? { target_class_id: requestedClassId, visibility: 'class' } : {}),
        };
    }
    const before = existing;
    const exam = await examService.updateExam(id, update);
    await logAudit(db as any, {
        action: 'update_written_exam', actorId: ctx.user?.id,
        resourceType: 'exam', resourceId: id, tableName: 'exams',
        oldValues: before, newValues: update,
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
