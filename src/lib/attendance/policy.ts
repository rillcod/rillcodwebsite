/**
 * One attendance policy, in one place.
 *
 * `late` and `excused` are valid statuses, but they were counted three
 * different ways: the result calculator credited only `present`, the
 * leaderboard credited `present` or `late`, and the attendance screen grouped
 * `late` with `excused`. The same learner therefore had different attendance
 * percentages depending on which screen you opened.
 *
 * The rule below is the single definition. Change it here and every surface
 * follows, including the SQL used by recalculate_academic_result, which
 * mirrors ATTENDED_STATUSES.
 */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

/**
 * Counts as having attended. A learner who arrived late was still taught, so
 * withholding the credit would understate real attendance.
 */
export const ATTENDED_STATUSES: readonly AttendanceStatus[] = ["present", "late"];

/**
 * Neither attended nor missed. An excused absence is authorised, so it is
 * removed from the denominator rather than counted against the learner.
 */
export const EXCLUDED_STATUSES: readonly AttendanceStatus[] = ["excused"];

export function countsAsAttended(status: string | null | undefined): boolean {
  return ATTENDED_STATUSES.includes((status ?? "") as AttendanceStatus);
}

export function isExcluded(status: string | null | undefined): boolean {
  return EXCLUDED_STATUSES.includes((status ?? "") as AttendanceStatus);
}

export type AttendanceRate = {
  attended: number;
  /** Sessions the learner was expected at, excluding authorised absences. */
  counted: number;
  excused: number;
  percentage: number;
};

/**
 * Attendance as a percentage of the sessions that actually counted.
 * `heldSessions` lets a caller measure against every session held, including
 * ones with no record at all, which is how the class-wide figure is derived.
 */
export function attendanceRate(
  statuses: (string | null | undefined)[],
  heldSessions?: number
): AttendanceRate {
  const attended = statuses.filter(countsAsAttended).length;
  const excused = statuses.filter(isExcluded).length;
  const recorded = typeof heldSessions === "number" ? heldSessions : statuses.length;
  const counted = Math.max(0, recorded - excused);
  return {
    attended,
    counted,
    excused,
    // Defensive cap: historical duplicate rows must not produce a public rate
    // above 100 while their source data is being reconciled.
    percentage: counted > 0 ? Math.min(100, Math.round((attended / counted) * 10000) / 100) : 0,
  };
}

/**
 * Public percentage when at least one session can fairly be measured.
 * `null` means "not measured", not zero attendance (for example, every
 * recorded session was excused).
 */
export function measuredAttendancePercentage(
  statuses: (string | null | undefined)[],
  heldSessions?: number
): number | null {
  const summary = attendanceRate(statuses, heldSessions);
  return summary.counted > 0 ? summary.percentage : null;
}
