import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';
import type { ApiContext } from '@/lib/api-wrapper';

type Actor = NonNullable<ApiContext['user']>;

export async function canReadWrittenExam(actor: Actor, examId: string): Promise<boolean> {
  if (actor.role === 'admin') return true;
  const db = createAdminClient();
  const { data: exam } = await db
    .from('exams')
    .select('id,created_by,course_id,courses!course_id(school_id)')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return false;
  const schoolId = (exam as any).courses?.school_id as string | null;

  if (actor.role === 'student') {
    if (!exam.course_id) return false;
    const scope = await resolveStudentProgramScope(db as any, actor.id);
    return scope.courseIds.has(exam.course_id);
  }
  if (actor.role === 'school') return !!actor.tenantId && schoolId === actor.tenantId;
  if (actor.role === 'teacher') {
    if (exam.created_by === actor.id) return true;
    const schoolIds = await getTeacherSchoolIds(actor.id, actor.tenantId ?? null);
    return !!schoolId && schoolIds.includes(schoolId);
  }
  return false;
}

export async function canReviewWrittenExam(actor: Actor, examId: string): Promise<boolean> {
  return actor.role !== 'student' && canReadWrittenExam(actor, examId);
}
