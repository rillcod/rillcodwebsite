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
