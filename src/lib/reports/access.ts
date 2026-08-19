import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';

type StaffCaller = { id: string; role: string; school_id?: string | null };

/**
 * Can this staff member modify / view a progress report?
 * Admins: yes.
 * Teachers: yes if they authored it, currently own the learner's class, or own
 * the class this report was written for (the learner may have moved on).
 */
export async function canAccessProgressReport(
  admin: any,
  caller: StaffCaller,
  report: { teacher_id?: string | null; student_id?: string | null; school_id?: string | null; class_id?: string | null },
  opts?: { transferOwnership?: boolean },
): Promise<{ ok: boolean; transfer?: boolean; studentClassId?: string | null }> {
  if (caller.role === 'admin') return { ok: true };
  if (caller.role !== 'teacher') return { ok: false };

  if (report.teacher_id === caller.id) return { ok: true };

  if (!report.student_id && !report.class_id) return { ok: false };

  const [classScope, { data: student }] = await Promise.all([
    getTeacherClassScope(admin, caller.id, caller.school_id ?? null),
    report.student_id
      ? admin.from('portal_users').select('class_id, school_id').eq('id', report.student_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const studentClassId = (student as { class_id?: string | null } | null)?.class_id ?? null;
  const ownsCurrentClass = !!studentClassId && classScope.classIds.includes(studentClassId);
  const ownsReportClass = !!report.class_id && classScope.classIds.includes(report.class_id);
  if (!ownsCurrentClass && !ownsReportClass) {
    return { ok: false, studentClassId };
  }

  return {
    ok: true,
    transfer: opts?.transferOwnership === true,
    studentClassId,
  };
}
