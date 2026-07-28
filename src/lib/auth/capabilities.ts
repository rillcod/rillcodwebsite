/**
 * What a role may DO — expressed once, as actions.
 *
 * Why this exists: "who is allowed here?" was answered by ~242 hand-written role
 * arrays across the API, and the same idea was spelled four different ways
 * (`['admin','teacher','school']`, `['teacher','admin','school']`, …). With no single
 * answer, each new route re-guessed, and the guesses drifted apart — partner schools
 * were blocked from grading in the dashboard but allowed to grade by calling the API
 * directly.
 *
 * Routes should ask for a CAPABILITY, not list roles. Then "may a partner school
 * grade?" is answered in one readable place instead of being re-decided per file.
 *
 * Note on the `school` role: it is a PARTNER SCHOOL account, not Rillcod staff. It may
 * see its own students' work, but it does not assess, author, or publish on Rillcod's
 * behalf — that is what its inclusion in read capabilities and absence from write
 * capabilities below encodes.
 */

export type PortalRole = 'admin' | 'teacher' | 'school' | 'parent' | 'student';

export type Capability =
  /** Award or change a mark on a student's work (incl. accepting an AI grade). */
  | 'grade'
  /** Publish or unpublish a progress report. */
  | 'publish_reports'
  /** Upload teaching material to the library. */
  | 'upload_library'
  /** Read student results/reports for a school in scope. */
  | 'view_reports'
  /** Destroy a record (submission, student, account). Never a partner school. */
  | 'delete_records'
  /**
   * See a partner school's OWN financial position with Rillcod — invoices to the
   * school, settlements, billing cycles. School-level money.
   */
  | 'view_school_finance'
  /**
   * See the AMOUNTS on an individual family's financial record — what a parent was
   * charged and paid, line items, balances. Rillcod's price to the family is its
   * margin over what the school is billed, so this stays on the platform.
   */
  | 'view_student_finance'
  /**
   * See only WHETHER a family has paid — a paid / unpaid indicator with no figures.
   * A partner school needs this to manage its pupils; it does not need the price.
   */
  | 'view_student_payment_status';

const CAPABILITY_ROLES: Record<Capability, readonly PortalRole[]> = {
  // Assessment is Rillcod's responsibility. A partner school reads outcomes; it does
  // not set them. This mirrors the dashboard's `canGrade` so the API and the UI agree.
  grade: ['admin', 'teacher'],
  publish_reports: ['admin', 'teacher'],
  upload_library: ['admin', 'teacher'],
  // Read-only: partner schools legitimately review their own students' results.
  view_reports: ['admin', 'teacher', 'school'],
  // Destruction is never delegated to a partner school.
  delete_records: ['admin', 'teacher'],
  // A school may see its own account with Rillcod...
  view_school_finance: ['admin', 'school'],
  // ...but the FIGURES on a family's invoice reveal Rillcod's margin over what the
  // school is billed. Amounts stay on the platform.
  view_student_finance: ['admin'],
  // The school still needs to know who has settled up — status only, no figures.
  view_student_payment_status: ['admin', 'teacher', 'school'],
};

export function roleHasCapability(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return (CAPABILITY_ROLES[capability] as readonly string[]).includes(role);
}

/** Roles permitted for a capability — for tests and for building UI affordances. */
export function rolesFor(capability: Capability): readonly PortalRole[] {
  return CAPABILITY_ROLES[capability];
}

export type CapabilityDenial = { error: string; status: 403 };

/**
 * Returns null when allowed, or a ready-to-return denial payload.
 *
 * Deliberately message-neutral about WHY a role is excluded — the caller should not
 * leak the permission model to an unauthorised client.
 */
export function denyIfMissingCapability(
  role: string | null | undefined,
  capability: Capability,
): CapabilityDenial | null {
  if (roleHasCapability(role, capability)) return null;
  return { error: 'You do not have permission to perform this action.', status: 403 };
}
