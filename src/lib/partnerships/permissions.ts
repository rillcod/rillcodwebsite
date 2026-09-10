/** Proposal outreach is shared; contracts and agreed terms remain admin-owned. */
export function canPreparePartnershipDocument(role: string | null | undefined, kind: unknown): boolean {
  return (kind === 'proposal' || kind === 'mou') &&
    (role === 'admin' || (role === 'teacher' && kind === 'proposal'));
}
