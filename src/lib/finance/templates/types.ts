/**
 * Canonical inputs for the finance PDF templates.
 * Both the SCHOOL and the INDIVIDUAL template accept these
 * structures; each template picks the fields relevant to its
 * stream and styles them accordingly.
 */

export interface ReceiptTemplateInput {
  /** Public reference number (REC-SCH-... or REC-...). */
  receiptNumber: string;
  /** Payment gateway / bank reference (for reconciliation). */
  transactionReference: string;
  /** Paid-at timestamp (ISO). */
  paidAt: string;
  /** Payment method: 'paystack' | 'stripe' | 'bank_transfer' | ... */
  paymentMethod: string;
  /** Amount received. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;

  /** Line items. One row for individuals, aggregated rows for schools. */
  items: Array<{ description: string; quantity?: number; unit_price?: number; total: number }>;

  /** Payer / bill-to — populated differently per stream. */
  payer: {
    name: string;
    email?: string;
    address?: string;
    /** For schools only: e.g. "Term 1 · 2026/2027". */
    term?: string;
    /** For schools only: the school name if payer is a school admin. */
    schoolName?: string;
  };

  /** Extra context shown in side-bar. */
  meta?: {
    invoiceNumber?: string;
    courseTitle?: string;
    studentCount?: number;   // schools only
    commissionRate?: number; // schools only — %
    rillcodRetain?: number;  // schools only — money
    schoolSettlement?: number; // schools only — money
    settlementReference?: string; // schools only
  };

  /** Optional notes block (free-form). */
  notes?: string;
}

export interface InvoiceTemplateInput extends Omit<ReceiptTemplateInput, 'receiptNumber' | 'transactionReference' | 'paidAt' | 'paymentMethod'> {
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled' | string;
  issuedAt: string;
  dueDate?: string;
  /** For individuals — where to pay. */
  depositAccount?: { bank_name: string; account_number: string; account_name: string };
  paymentLink?: string;
}
