import type { CredentialDelivery } from '@/lib/parent-claim/deliver-credentials';

/** Payload returned to the UI after parent claim completes (OTP or frictionless). */
export type ParentClaimLinkedResult = {
  childName: string | null;
  accountCreated: boolean;
  siblingsLinked: number;
  credentials?: CredentialDelivery | null;
};
