export type ParentClaimAuditAction =
  | 'code_sent'
  | 'code_delivery_failed'
  | 'otp_failed'
  | 'otp_verified'
  | 'completion_failed'
  | 'linked'
  | 'blocked'
  | 'unlinked';

export const PARENT_CLAIM_ACTION_LABELS: Record<ParentClaimAuditAction, string> = {
  code_sent: 'Verification code sent',
  code_delivery_failed: 'Code delivery needs attention',
  otp_failed: 'Verification attempt unsuccessful',
  otp_verified: 'Identity verified',
  completion_failed: 'Setup needs attention',
  linked: 'Parent linked',
  blocked: 'Claim safely blocked',
  unlinked: 'Parent link removed',
};

export function isParentClaimAuditAction(action: string): action is ParentClaimAuditAction {
  return Object.prototype.hasOwnProperty.call(PARENT_CLAIM_ACTION_LABELS, action);
}

export function parentClaimActivitySummary(action: ParentClaimAuditAction, siblingsLinked = 0): string {
  switch (action) {
    case 'code_sent': return 'A verification code was sent to the parent contact.';
    case 'code_delivery_failed': return 'The verification code could not be delivered. No access was granted.';
    case 'otp_failed': return 'An incorrect verification code was entered. Access remained protected.';
    case 'otp_verified': return 'The parent identity was verified and child access was linked.';
    case 'completion_failed': return 'Identity was verified, but account setup needs attention. The family can retry safely.';
    case 'linked': return siblingsLinked > 0
      ? `The parent account was linked to this child and ${siblingsLinked} sibling account${siblingsLinked === 1 ? '' : 's'}.`
      : 'The parent account was linked to this child.';
    case 'blocked': return 'The claim was blocked because the child is already linked to another parent account.';
    case 'unlinked': return 'An authorised staff member removed the parent-child link.';
  }
}

export function parentClaimNextAction(action: ParentClaimAuditAction): string | null {
  if (action === 'completion_failed') return 'Retry setup or review Onboarding Health.';
  if (action === 'code_delivery_failed') return 'Confirm the parent contact details and resend the code.';
  if (action === 'blocked') return 'Confirm guardian identity before changing the existing link.';
  if (action === 'otp_failed') return 'The family may retry while attempts remain.';
  return null;
}
