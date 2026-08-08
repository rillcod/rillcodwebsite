export type AttendanceEligibilityInput = {
  sessionClassId: string | null;
  studentClassId: string | null;
  rosterStatus?: string | null;
  hasRosterRecord: boolean;
};

/**
 * The current-term roster is authoritative when it exists. Older learners may
 * not have a roster row, so portal_users.class_id remains the safe fallback.
 * A withdrawn roster must override a stale class_id and block new attendance.
 */
export function canRecordAttendanceForStudent(input: AttendanceEligibilityInput): boolean {
  if (!input.sessionClassId) return false;
  if (input.hasRosterRecord) {
    return String(input.rosterStatus || '').trim().toLowerCase() === 'active';
  }
  return input.studentClassId === input.sessionClassId;
}
