/**
 * Finance stream classifier & constants.
 *
 * Rillcod intentionally operates TWO billing streams:
 *
 *   SCHOOL      — Partner schools (B2B). Rillcod aggregates student
 *                 invoices into a termly billing_cycle, retains a
 *                 commission (default 15%) and settles the balance
 *                 back to the school via school_settlements.
 *
 *   INDIVIDUAL  — Direct learners and parents (B2C). Rillcod keeps
 *                 100% of each payment. One invoice per enrolment
 *                 or subscription.
 *
 * Every invoice/receipt is labelled with its stream in the database
 * (see migration 20260422000000_finance_stream_alignment.sql). This
 * module is the single source of truth for classification rules,
 * display labels, commission defaults and number-prefix conventions.
 */

export type FinanceStream = 'school' | 'individual';

export const STREAMS: Record<FinanceStream, {
  key: FinanceStream;
  label: string;
  shortLabel: string;
  description: string;
  invoicePrefix: string;
  receiptPrefix: string;
  accent: string;
}> = {
  school: {
    key: 'school',
    label: 'School Billing',
    shortLabel: 'School',
    description: 'Partner schools, termly cycles, commission + settlement.',
    invoicePrefix: 'INV-SCH-',
    receiptPrefix: 'REC-SCH-',
    accent: 'indigo',
  },
  individual: {
    key: 'individual',
    label: 'Learner Billing',
    shortLabel: 'Individual',
    description: 'Direct learners and parents, one-off and subscription.',
    invoicePrefix: 'INV-',
    receiptPrefix: 'REC-',
    accent: 'emerald',
  },
};

export const DEFAULT_COMMISSION_RATE = 15; // percent

/** Commission & settlement split for a school cycle total. */
export function splitSchoolAmount(totalAmount: number, commissionRate = DEFAULT_COMMISSION_RATE) {
  const rate = Math.min(Math.max(commissionRate, 0), 100);
  const rillcodRetain = +(totalAmount * (rate / 100)).toFixed(2);
  const schoolSettlement = +(totalAmount - rillcodRetain).toFixed(2);
  return { rillcodRetain, schoolSettlement, rate };
}

export interface InvoiceClassifierInput {
  /**
   * Accept `string` (as emitted by Supabase generated types for a text
   * column with a CHECK constraint) and narrow internally. Callers never
   * have to cast.
   */
  stream?: FinanceStream | string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  billing_cycle_id?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Classify an invoice (or invoice-like row) into its stream.
 *
 * Rules (in order):
 *   1. Explicit `stream` column wins.
 *   2. A billing_cycle linkage → school.
 *   3. metadata.stream hint → trust it.
 *   4. school_id present AND portal_user_id missing → school.
 *   5. Fallback → individual.
 */
export function classifyInvoiceStream(row: InvoiceClassifierInput): FinanceStream {
  if (row.stream === 'school' || row.stream === 'individual') return row.stream;
  if (row.billing_cycle_id) return 'school';
  const hint = row.metadata?.stream;
  if (hint === 'school' || hint === 'individual') return hint;
  if (row.school_id && !row.portal_user_id) return 'school';
  return 'individual';
}

export interface ReceiptClassifierInput {
  stream?: FinanceStream | string | null;
  school_id?: string | null;
  student_id?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Classify a receipt/transaction into its stream.
 * Same spirit as invoices: explicit first, then heuristic.
 */
export function classifyReceiptStream(row: ReceiptClassifierInput): FinanceStream {
  if (row.stream === 'school' || row.stream === 'individual') return row.stream;
  const hint = row.metadata?.stream;
  if (hint === 'school' || hint === 'individual') return hint;
  if (row.school_id && !row.student_id) return 'school';
  return 'individual';
}

/** Tailwind helper: pill styling per stream — used by all finance UI. */
export function streamPillClasses(stream: FinanceStream): string {
  if (stream === 'school') {
    return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30';
  }
  return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30';
}

/** Pretty label used in chips, headings, exports. */
export function streamLabel(stream: FinanceStream, form: 'long' | 'short' = 'short') {
  return form === 'long' ? STREAMS[stream].label : STREAMS[stream].shortLabel;
}
