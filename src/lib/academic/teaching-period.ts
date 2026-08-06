/**
 * Teaching period identity — one context for assignments, reports, and results.
 *
 * School (termly): term_id is the gradebook key.
 * Special / duration: offering_period_id is the gradebook key; term_id stays null
 * so holiday work never falls into a concurrent school term report.
 */

export type AcademicModel = 'termly_school' | 'duration_programme' | string | null;

export type TeachingPeriodContext = {
  class_id?: string | null;
  school_id?: string | null;
  academic_offering_id?: string | null;
  offering_period_id?: string | null;
  term_id?: string | null;
  academic_model?: AcademicModel;
};

export function isDurationProgramme(
  model: AcademicModel | undefined,
): boolean {
  return model === 'duration_programme';
}

/**
 * Whether live-term fallback is allowed when resolving assignment term_id.
 * Only duration programmes must skip the live school term. Termly school
 * offerings still use the live calendar when the class has no term yet.
 */
export function allowLiveTermFallback(ctx: TeachingPeriodContext): boolean {
  if (isDurationProgramme(ctx.academic_model)) return false;
  return true;
}

type EvidenceRow = {
  term_id?: string | null;
  academic_offering_id?: string | null;
  offering_period_id?: string | null;
  assignments?: {
    term_id?: string | null;
    academic_offering_id?: string | null;
    offering_period_id?: string | null;
    academic_model?: AcademicModel;
  } | null;
  graded_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

export type EvidenceWindow = {
  academicTermId?: string | null;
  startDate: string;
  endDate: string;
  /** When set, only duration evidence for this period is kept. */
  offeringPeriodId?: string | null;
};

/** How to pick a date stamp for null-term school rows in a term window. */
export type EvidenceDateStamp = 'graded_submitted' | 'include_created';

const isoStart = (date: string) => `${date}T00:00:00.000Z`;
const isoEnd = (date: string) => `${date}T23:59:59.999Z`;

function inDateWindow(stamp: string | null | undefined, range: EvidenceWindow): boolean {
  if (!stamp) return false;
  const t = new Date(stamp).getTime();
  return (
    t >= new Date(isoStart(range.startDate)).getTime() &&
    t <= new Date(isoEnd(range.endDate)).getTime()
  );
}

function rowOfferingId(row: EvidenceRow): string | null {
  return (
    row.academic_offering_id ||
    row.assignments?.academic_offering_id ||
    null
  );
}

function rowPeriodId(row: EvidenceRow): string | null {
  return (
    row.offering_period_id ||
    row.assignments?.offering_period_id ||
    null
  );
}

function rowTermId(row: EvidenceRow): string | null {
  return row.term_id || row.assignments?.term_id || null;
}

/**
 * School-term reports: match explicit term_id, or date-window for untagged
 * school work. Null-term rows that only carry an offering/period stamp are
 * treated as duration evidence and stay out of the school term window.
 */
export function evidenceBelongsToSchoolTerm(
  row: EvidenceRow,
  range: EvidenceWindow,
  opts?: { dateStamp?: EvidenceDateStamp },
): boolean {
  const termId = rowTermId(row);
  if (range.academicTermId && termId) {
    return termId === range.academicTermId;
  }

  // Duration work is usually term_id = null + offering/period stamp.
  // Termly school work that already has a term_id was handled above.
  if (!termId && (rowOfferingId(row) || rowPeriodId(row))) {
    if (range.offeringPeriodId && rowPeriodId(row) === range.offeringPeriodId) {
      return true;
    }
    return false;
  }

  const stamp =
    opts?.dateStamp === 'graded_submitted'
      ? row.graded_at || row.submitted_at
      : row.graded_at || row.submitted_at || row.created_at;
  return inDateWindow(stamp, range);
}

/** Attendance uses term_id when present; otherwise the date window. */
export function attendanceBelongsToSchoolTerm(
  row: { term_id?: string | null; created_at?: string | null },
  range: EvidenceWindow,
): boolean {
  if (range.academicTermId && row.term_id) {
    return row.term_id === range.academicTermId;
  }
  return inDateWindow(row.created_at, range);
}
