/** Staff deep-link from a payment row to Contact Directory search. */
export function contactDirectorySearchUrl(opts: {
  contactEmail?: string | null;
  contactPhone?: string | null;
  payerName?: string | null;
  studentName?: string | null;
}): string | null {
  const q = (opts.contactEmail || opts.contactPhone || opts.payerName || opts.studentName || '').trim();
  if (!q) return null;
  return `/dashboard/customer-book?q=${encodeURIComponent(q)}`;
}

export function txPrimaryLabel(tx: {
  description?: string | null;
  studentName?: string | null;
  payerName?: string | null;
  portal_users?: { full_name?: string | null } | null;
  courses?: { title?: string | null } | null;
}): string {
  return tx.description
    || tx.studentName
    || tx.payerName
    || tx.portal_users?.full_name
    || tx.courses?.title
    || 'Payment';
}
