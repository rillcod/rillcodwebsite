/** Plain-language enrollment status for parent UI (not raw DB values). */
export function parentEnrollmentLabel(status: string | null | undefined): string {
  const s = (status || '').toLowerCase().trim();
  switch (s) {
    case 'approved':
    case 'active':
    case 'paid':
      return 'Active';
    case 'partially_paid':
      return 'Partially paid';
    case 'pending':
      return 'Pending activation';
    case 'inactive':
    case 'withdrawn':
      return 'Inactive';
    case 'rejected':
      return 'Not approved';
    default:
      return s ? s.replace(/_/g, ' ') : 'Unknown';
  }
}

export function parentEnrollmentIsGood(status: string | null | undefined): boolean {
  return ['approved', 'active', 'paid', 'partially_paid'].includes((status || '').toLowerCase());
}

/** Plain copy for parent portal when a learner is off the active roster but keeps login. */
export function parentInactiveLearnerHint(_status?: string | null): string {
  return 'Not on the active class roster right now, but login stays on. Published report cards from earlier terms remain available. Live grades only show the current school term.';
}
