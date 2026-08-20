import { hasDeparted } from '@/lib/rosters/membership';
import { parentEnrollmentIsGood, parentEnrollmentLabel } from '@/lib/parents/enrollment-label';

export type ParentLearnerRosterRow = {
  student_id: string;
  class_id: string;
  status: string | null;
};

const REGISTRY_INACTIVE = new Set(['inactive', 'withdrawn', 'suspended']);

/** True when the learner has a departed roster row for their assigned class. */
export function learnerDepartedOnClassRoster(
  studentId: string,
  classId: string | null | undefined,
  rosterRows: ParentLearnerRosterRow[],
): boolean {
  if (!classId) return false;
  return rosterRows.some(
    (row) =>
      row.student_id === studentId &&
      row.class_id === classId &&
      hasDeparted(row.status),
  );
}

/** Parent-facing enrollment fields — registry status plus class roster withdrawal. */
export function parentLearnerEnrollmentFields(input: {
  studentStatus: string | null | undefined;
  rosterInactive: boolean;
}): { enrollment_label: string; is_enrollment_active: boolean } {
  const registryInactive = REGISTRY_INACTIVE.has((input.studentStatus || '').toLowerCase());
  const isActive = !input.rosterInactive && !registryInactive && parentEnrollmentIsGood(input.studentStatus);
  if (!isActive) {
    return { enrollment_label: 'Inactive', is_enrollment_active: false };
  }
  return {
    enrollment_label: parentEnrollmentLabel(input.studentStatus),
    is_enrollment_active: true,
  };
}

/** Batch-load roster rows and portal class assignments for linked learners. */
export async function loadParentLearnerRosterContext(
  admin: any,
  children: Array<{ id: string; user_id?: string | null; status?: string | null }>,
): Promise<
  Map<
    string,
    { enrollment_label: string; is_enrollment_active: boolean }
  >
> {
  const out = new Map<string, { enrollment_label: string; is_enrollment_active: boolean }>();
  if (children.length === 0) return out;

  const studentIds = children.map((c) => c.id);
  const userIds = children.map((c) => c.user_id).filter(Boolean) as string[];

  const classByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: portalUsers } = await admin
      .from('portal_users')
      .select('id, class_id')
      .in('id', userIds);
    for (const row of portalUsers ?? []) {
      classByUserId.set(row.id, row.class_id ?? null);
    }
  }

  let rosterRows: ParentLearnerRosterRow[] = [];
  const { data: rosters, error: rosterErr } = await admin
    .from('class_term_rosters')
    .select('student_id, class_id, status')
    .in('student_id', studentIds);
  if (rosterErr?.code !== '42P01') {
    rosterRows = (rosters ?? []) as ParentLearnerRosterRow[];
  }

  for (const child of children) {
    const classId = child.user_id ? classByUserId.get(child.user_id) ?? null : null;
    const rosterInactive = learnerDepartedOnClassRoster(child.id, classId, rosterRows);
    out.set(child.id, parentLearnerEnrollmentFields({
      studentStatus: child.status,
      rosterInactive,
    }));
  }

  return out;
}
