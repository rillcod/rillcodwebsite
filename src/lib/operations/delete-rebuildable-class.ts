import type { SupabaseClient } from '@supabase/supabase-js';
import { hasLearnerAssignmentEvidence } from '@/lib/academic/record-retention';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';

export type DeleteRebuildableClassOk = {
  ok: true;
  detachedStudents: number;
  atomic: boolean;
};

export type DeleteRebuildableClassFail = {
  ok: false;
  status: number;
  error: string;
  code?: string;
};

export type DeleteRebuildableClassResult = DeleteRebuildableClassOk | DeleteRebuildableClassFail;

export function classifyRebuildableClassDeleteError(error: {
  code?: string | null;
  message?: string | null;
}): 'protected' | 'forbidden' | 'not_found' | 'missing_function' | 'in_use' | 'failed' {
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (message.includes('PROTECTED_ACADEMIC_EVIDENCE')) return 'protected';
  if (code === 'P0002' || message.includes('CLASS_NOT_FOUND')) return 'not_found';
  if (code === '42501' || message.includes('ACTOR_NOT_ALLOWED') || message.includes('CLASS_OUT_OF_SCOPE')) {
    return 'forbidden';
  }
  if (
    ['PGRST202', '42883'].includes(code)
    || message.toLowerCase().includes('could not find the function')
    || message.toLowerCase().includes('does not exist')
  ) {
    return 'missing_function';
  }
  if (code === '23503') return 'in_use';
  return 'failed';
}

export const PROTECTED_CLASS_DELETE_MESSAGE =
  'This class contains learner submissions, attempts, reports, term grades, or assessment evidence. Keep the class as a historical record instead of deleting it.';

export const CLASS_IN_USE_DELETE_MESSAGE =
  'This class is still used by a teaching plan or another operational record. Remove or move that draft first.';

/**
 * One command for class cleanup. Prefers the atomic database function and
 * keeps a rolling-deployment fallback that never detaches students before the
 * class row is gone. Learner evidence always refuses the delete.
 */
export async function deleteRebuildableClass(input: {
  admin: SupabaseClient<any>;
  classId: string;
  actorId: string;
}): Promise<DeleteRebuildableClassResult> {
  const cleanupPolicy = await loadCleanupPolicy(input.admin);
  if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return { ok: false, status: 409, error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' };
  }

  const atomic = await input.admin.rpc('delete_rebuildable_class', {
    p_class_id: input.classId,
    p_actor_id: input.actorId,
  });
  if (!atomic.error) {
    return {
      ok: true,
      detachedStudents: Number((atomic.data as { detached_students?: number } | null)?.detached_students ?? 0),
      atomic: true,
    };
  }

  const kind = classifyRebuildableClassDeleteError(atomic.error);
  if (kind === 'protected') {
    return { ok: false, status: 409, error: PROTECTED_CLASS_DELETE_MESSAGE, code: 'PROTECTED_ACADEMIC_EVIDENCE' };
  }
  if (kind === 'forbidden') {
    return { ok: false, status: 403, error: 'Access denied', code: 'CLASS_OUT_OF_SCOPE' };
  }
  if (kind === 'not_found') {
    return { ok: false, status: 404, error: 'Class not found', code: 'CLASS_NOT_FOUND' };
  }
  if (kind !== 'missing_function') {
    console.error('[classes.delete] atomic cleanup failed', { classId: input.classId, code: atomic.error.code });
    return {
      ok: false,
      status: kind === 'in_use' ? 409 : 500,
      error: kind === 'in_use'
        ? CLASS_IN_USE_DELETE_MESSAGE
        : 'The class could not be removed safely. Nothing was changed; please retry.',
    };
  }

  try {
    if (await classHasProtectedAcademicEvidence(input.admin, input.classId)) {
      return { ok: false, status: 409, error: PROTECTED_CLASS_DELETE_MESSAGE, code: 'PROTECTED_ACADEMIC_EVIDENCE' };
    }
  } catch (cause: any) {
    console.error('[classes.delete] evidence preflight failed', { classId: input.classId, code: cause?.code });
    return { ok: false, status: 503, error: 'Academic records could not be verified. Nothing was deleted; please retry.' };
  }

  const { data: roster } = await input.admin
    .from('portal_users')
    .select('id')
    .eq('class_id', input.classId)
    .eq('role', 'student');
  const { error: deleteError } = await input.admin.from('classes').delete().eq('id', input.classId);
  if (deleteError) {
    return {
      ok: false,
      status: deleteError.code === '23503' ? 409 : 500,
      error: deleteError.code === '23503'
        ? CLASS_IN_USE_DELETE_MESSAGE
        : 'The class could not be removed safely. Nothing was changed; please retry.',
    };
  }

  const rosterIds = (roster ?? []).map((student) => student.id);
  if (rosterIds.length > 0) {
    const { error: labelError } = await input.admin.from('portal_users')
      .update({ section_class: null })
      .in('id', rosterIds)
      .eq('role', 'student');
    if (labelError) {
      console.error('[classes.delete] stale class label cleanup failed', {
        classId: input.classId,
        code: labelError.code,
      });
    }
  }

  return { ok: true, detachedStudents: rosterIds.length, atomic: false };
}

export async function classHasProtectedAcademicEvidence(
  admin: SupabaseClient<any>,
  classId: string,
): Promise<boolean> {
  const [assignments, cbtExams, writtenExams, reports, termGrades, evidence] = await Promise.all([
    admin.from('assignments').select('id').eq('class_id', classId),
    admin.from('cbt_exams').select('id').eq('class_id', classId),
    admin.from('exams').select('id').eq('class_id', classId),
    admin.from('student_progress_reports')
      .select('is_published,calculation_mode,theory_score,practical_score,attendance_score,participation_score,overall_score')
      .eq('class_id', classId),
    admin.from('enrollment_term_grades').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    admin.from('academic_assessment_evidence').select('id', { count: 'exact', head: true }).eq('class_id', classId),
  ]);
  const lookupError = [assignments.error, cbtExams.error, writtenExams.error, reports.error, termGrades.error, evidence.error]
    .find(Boolean);
  if (lookupError) throw lookupError;

  const assignmentIds = (assignments.data ?? []).map((row) => row.id);
  const cbtExamIds = (cbtExams.data ?? []).map((row) => row.id);
  const writtenExamIds = (writtenExams.data ?? []).map((row) => row.id);
  const [submissions, cbtAttempts, writtenAttempts] = await Promise.all([
    assignmentIds.length
      ? admin.from('assignment_submissions')
        .select('id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status')
        .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    cbtExamIds.length
      ? admin.from('cbt_sessions').select('id').in('exam_id', cbtExamIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
    writtenExamIds.length
      ? admin.from('exam_attempts').select('id').in('exam_id', writtenExamIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const evidenceError = [submissions.error, cbtAttempts.error, writtenAttempts.error].find(Boolean);
  if (evidenceError) throw evidenceError;

  const reportHasEvidence = (reports.data ?? []).some((report: any) =>
    report.is_published === true
    || report.calculation_mode === 'manual'
    || [report.theory_score, report.practical_score, report.attendance_score, report.participation_score, report.overall_score]
      .some((score) => score != null));
  return (submissions.data ?? []).some(hasLearnerAssignmentEvidence)
    || (cbtAttempts.data?.length ?? 0) > 0
    || (writtenAttempts.data?.length ?? 0) > 0
    || reportHasEvidence
    || (termGrades.count ?? 0) > 0
    || (evidence.count ?? 0) > 0;
}
