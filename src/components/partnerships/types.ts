/**
 * The shapes the partnership builder passes between its panels.
 *
 * These mirror what the routes actually return rather than the database rows —
 * `/api/partnerships/terms` decorates each row with a `summary` string built by
 * `describeTerms`, and the document list decorates each row with its normalised
 * `terms` snapshot. A panel should render what it was handed, not re-derive it.
 */

import type { PartnershipTerms } from '@/lib/partnerships/terms';

export type BillingModel = 'per_student' | 'fixed_package' | 'tiered';
export type DocumentKind = 'proposal' | 'mou';

export type SchoolRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  student_count: number | null;
  status: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type TermsTier = { label: string; count: number; rate: number };

export type TermsRow = {
  id: string;
  school_id: string;
  billing_model: BillingModel;
  currency: string;
  billing_cycle: string;
  amount_per_student: number | null;
  fixed_package_price: number | null;
  tiers: TermsTier[] | null;
  deposit_amount: number | null;
  rillcod_share_percent: number | null;
  school_share_percent: number | null;
  /** When the school's share arrives, and what moves it. Null means not agreed. */
  settlement_days: number | null;
  settlement_trigger: 'term_end' | 'on_collection' | null;
  withdrawal_policy: 'pro_rata' | 'no_refund' | 'credit_next_term' | null;
  minimum_students: number | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  version: number | null;
  notes: string | null;
  agreed_at: string | null;
  created_at: string | null;
  /** One sentence stating the deal, from `describeTerms`. */
  summary?: string | null;
};

export type IssuedDocumentRow = {
  id: string;
  reference: string | null;
  document_kind: DocumentKind;
  status: string;
  sent_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  created_at: string | null;
  /** Secret behind the public /p/<token> link. */
  share_token: string | null;
  /** 6-digit access code for phone/quick lookup at /p */
  access_code?: string | null;
  /** The date the quoted fees lapse. Null on an MoU, and on anything issued before expiry was recorded. */
  valid_until?: string | null;
  /** Whether the recipient has opened the link, and how often. */
  first_opened_at?: string | null;
  last_opened_at?: string | null;
  open_count?: number | null;
  /**
   * The terms the document was rendered against, frozen at issue and normalised
   * from the snapshot. Null for a proposal issued before any rate was agreed.
   */
  terms: PartnershipTerms | null;
};

/** What a fresh issue returns — the only path that hands back the document body. */
export type IssuedDocument = {
  id: string;
  reference: string;
  kind: DocumentKind;
  school: string;
  narrative_source: 'authored' | 'ai' | null;
  curriculum_edition: number | null;
  html: string;
  /** Secret behind the public /p/<token> link. Null on a preview: no row, no link. */
  share_token: string | null;
  /** 6-digit access code for quick phone verification */
  access_code?: string | null;
  email_sent?: boolean;
};

export function formatMoney(amount: number, currency = 'NGN'): string {
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  return `${symbol}${Math.round(amount).toLocaleString('en-NG')}`;
}
