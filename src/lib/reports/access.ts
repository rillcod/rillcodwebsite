import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';

type StaffCaller = { id: string; role: string; school_id?: string | null };

/**
 * Can this staff member modify / view a progress report?
 * Admins: yes.
 * Teachers: yes if they authored it OR they currently own the student's class
 * (class handoff / term rollover — same rule as POST takeover).
 */
export async function canAccessProgressReport(
  admin: any,
  caller: StaffCaller,
  report: { teacher_id?: string | null; student_id?: string | null; school_id?: string | null },
  opts?: { transferOwnership?: boolean },
): Promise<{ ok: boolean; transfer?: boolean; studentClassId?: string | null }> {
  if (caller.role === 'admin') return { ok: true };
  if (caller.role !== 'teacher') return { ok: false };

  if (report.teacher_id === caller.id) return { ok: true };

  if (!report.student_id) return { ok: false };

  const [classScope, { data: student }] = await Promise.all([
    getTeacherClassScope(admin, caller.id, caller.school_id ?? null),
    admin.from('portal_users').select('class_id, school_id').eq('id', report.student_id).maybeSingle(),
  ]);

  const studentClassId = (student as { class_id?: string | null } | null)?.class_id ?? null;
  if (!studentClassId || !classScope.classIds.includes(studentClassId)) {
    return { ok: false, studentClassId };
  }

  return {
    ok: true,
    transfer: opts?.transferOwnership === true,
    studentClassId,
  };
}
