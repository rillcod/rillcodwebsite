import { matchesAssignmentSession } from '@/lib/assignments/session';
import { matchesCbtExam } from '@/lib/cbt/session';
import {
  resolveSchoolProgrammePolicy,
} from '@/lib/academic/school-programme-standing';
import { assessmentExperience } from '@/lib/academic/assessment-experience';
import { readSupabaseWithTransientRetry } from '@/lib/supabase/read-retry';

type AnyDb = { from: (table: string) => any };

export type ClassAssessmentActor = {
  id: string;
  role: string;
  school_id: string | null;
};

export function assessmentBelongsToClass(
  row: { class_id?: string | null; metadata?: Record<string, unknown> | null },
  classId: string,
): boolean {
  // A real column is authoritative. Read the compatibility mirror only for an
  // old row that has no canonical class identity.
  if (row.class_id) return row.class_id === classId;
  return row.metadata?.target_class_id === classId;
}

export class ClassAssessmentWorkspaceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ClassAssessmentWorkspaceError';
  }
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function loadClassAssessmentWorkspace(
  db: AnyDb,
  classId: string,
  actor: ClassAssessmentActor,
) {
  const classResult = await readSupabaseWithTransientRetry<any>(() =>
    db
      .from('classes')
      .select(
        'id,name,school_id,teacher_id,program_id,current_course_id,term_id,academic_offering_id,offering_period_id,academic_terms(id,start_date,end_date),schools(name,programme_standing,exam_capture,test_capture)',
      )
      .eq('id', classId)
      .maybeSingle(),
  );
  if (classResult.error) {
    throw new ClassAssessmentWorkspaceError(
      'The class assessment record could not be loaded. Please retry.',
      503,
    );
  }
  const klass = classResult.data;
  if (!klass) throw new ClassAssessmentWorkspaceError('Class not found', 404);

  if (!['admin', 'teacher', 'school'].includes(actor.role)) {
    throw new ClassAssessmentWorkspaceError('Staff access required', 403);
  }
  if (actor.role === 'teacher' && klass.teacher_id !== actor.id) {
    throw new ClassAssessmentWorkspaceError('This class is not assigned to you', 403);
  }
  if (actor.role === 'school' && (!actor.school_id || klass.school_id !== actor.school_id)) {
    throw new ClassAssessmentWorkspaceError('This class belongs to another school', 403);
  }

  const classFilter = `class_id.eq.${classId},metadata->>target_class_id.eq.${classId}`;
  const [assignmentResult, examResult] = await Promise.all([
    readSupabaseWithTransientRetry<any[]>(() =>
      db
        .from('assignments')
        .select(
          'id,title,assignment_type,due_date,max_points,is_active,term_id,class_id,course_id,lesson_id,lesson_plan_id,metadata',
        )
        .or(classFilter)
        .order('due_date', { ascending: true, nullsFirst: false }),
    ),
    readSupabaseWithTransientRetry<any[]>(() =>
      db
        .from('cbt_exams')
        .select(
          'id,title,duration_minutes,total_questions,is_active,start_date,end_date,term_id,class_id,course_id,lesson_id,lesson_plan_id,metadata',
        )
        .or(classFilter)
        .order('start_date', { ascending: false, nullsFirst: false }),
    ),
  ]);

  if (assignmentResult.error || examResult.error) {
    throw new ClassAssessmentWorkspaceError(
      'The class assessment record could not be loaded completely. Please retry; no marks have been changed.',
      503,
    );
  }

  const assignments = (assignmentResult.data ?? []).filter(
    (row) =>
      assessmentBelongsToClass(row, classId)
      && matchesAssignmentSession(row.term_id, klass.term_id, true),
  );
  const termBounds = relationOne<any>(klass.academic_terms);
  const exams = (examResult.data ?? []).filter(
    (row) =>
      assessmentBelongsToClass(row, classId)
      && matchesCbtExam(row, klass.term_id, termBounds, true),
  );
  const assignmentIds = assignments.map((row) => row.id);
  const examIds = exams.map((row) => row.id);

  const [submissionResult, sessionResult] = await Promise.all([
    assignmentIds.length
      ? readSupabaseWithTransientRetry<any[]>(() =>
          db
            .from('assignment_submissions')
            .select('id,assignment_id,portal_user_id,user_id,grade,status,version,feedback')
            .in('assignment_id', assignmentIds),
        )
      : Promise.resolve({ data: [], error: null, attempts: 1 }),
    examIds.length
      ? readSupabaseWithTransientRetry<any[]>(() =>
          db
            .from('cbt_sessions')
            .select('id,exam_id,user_id,score,status,needs_grading,grading_version')
            .in('exam_id', examIds),
        )
      : Promise.resolve({ data: [], error: null, attempts: 1 }),
  ]);

  if (submissionResult.error || sessionResult.error) {
    throw new ClassAssessmentWorkspaceError(
      'Student marking records could not be loaded completely. Please retry; no marks have been changed.',
      503,
    );
  }

  const school = relationOne<any>(klass.schools);
  const policy = resolveSchoolProgrammePolicy({
    programme_standing: school?.programme_standing,
    exam_capture: school?.exam_capture,
    test_capture: school?.test_capture,
  });
  const submissions = submissionResult.data ?? [];
  const cbtSessions = sessionResult.data ?? [];
  const now = Date.now();
  const openAssignments = assignments.filter((row) =>
    row.is_active !== false
    && (!row.due_date || Date.parse(row.due_date) >= now),
  ).length;
  const activeExams = exams.filter((row) => row.is_active === true).length;
  const marked = submissions.filter((row) => row.grade != null).length
    + cbtSessions.filter((row) => row.score != null).length;
  const awaitingReview = submissions.filter((row) => row.grade == null).length
    + cbtSessions.filter((row) => row.score == null || row.needs_grading === true).length;

  return {
    class: {
      id: klass.id,
      name: klass.name,
      school_id: klass.school_id,
      program_id: klass.program_id,
      current_course_id: klass.current_course_id,
      term_id: klass.term_id,
      academic_offering_id: klass.academic_offering_id,
      offering_period_id: klass.offering_period_id,
      school_name: school?.name ?? null,
    },
    programme_policy: policy,
    experience: assessmentExperience(policy),
    assignments,
    exams,
    submissions,
    cbt_sessions: cbtSessions,
    summary: {
      open: openAssignments + activeExams,
      marked,
      awaiting_review: awaitingReview,
    },
  };
}
