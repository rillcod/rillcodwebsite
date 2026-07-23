type LedgerInput = {
  payment_method?: unknown;
  school_id?: unknown;
  portal_user_id?: unknown;
  payment_gateway_response?: unknown;
  portal_users?: { full_name?: unknown; email?: unknown } | null;
  courses?: { title?: unknown } | null;
  invoices?: { invoice_number?: unknown; items?: unknown; billing_cycle_id?: unknown; stream?: unknown } | null;
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  registration: 'Student registration',
  special_program: 'Special programme',
  special_program_balance: 'Special programme balance',
  summer_school: 'Summer / special programme',
  summer_school_balance: 'Special programme balance',
  billing_cycle: 'School billing',
  invoice_payment: 'Invoice payment',
  subscription: 'Subscription',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  paystack: 'Paystack',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  pos: 'POS',
  manual: 'Manual',
};

function paymentMethodLabel(raw: unknown): string {
  const key = clean(raw).toLowerCase();
  return PAYMENT_METHOD_LABELS[key] || key.replaceAll('_', ' ') || 'Unknown';
}

export type LedgerDescription = {
  description: string;
  source: string;
  sourceType: string;
  payerName: string | null;
  studentName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  programLabel: string | null;
};

export function describeLedgerEntry(row: LedgerInput): LedgerDescription {
  const metadata = row.payment_gateway_response && typeof row.payment_gateway_response === 'object' && !Array.isArray(row.payment_gateway_response)
    ? row.payment_gateway_response as Record<string, unknown>
    : {};
  const invoice = row.invoices || null;
  const items = Array.isArray(invoice?.items) ? invoice.items as Array<Record<string, unknown>> : [];
  const itemDescription = clean(items[0]?.description);
  const paymentType = clean(metadata.payment_type).toLowerCase();
  const payer = clean(row.portal_users?.full_name);
  const parentName = clean(metadata.parent_name);
  const studentName = clean(metadata.student_name || metadata.full_name);
  const parentEmail = clean(metadata.parent_email || row.portal_users?.email);
  const parentPhone = clean(metadata.parent_phone || metadata.parent_whatsapp);
  const programTitle = clean(metadata.program_title);
  const enrollmentType = clean(metadata.enrollment_type);
  const courseInterest = clean(metadata.course_interest);
  const invoiceNumber = clean(invoice?.invoice_number);
  const course = clean(row.courses?.title);

  const payerName = payer || parentName || null;
  const programLabel = programTitle || courseInterest || course || null;

  let sourceType = paymentType || (invoice?.billing_cycle_id ? 'billing_cycle' : invoiceNumber ? 'invoice' : course ? 'course' : row.school_id ? 'school' : 'individual');

  let purpose = itemDescription || programLabel || PAYMENT_TYPE_LABELS[sourceType];
  if (!purpose) {
    if (enrollmentType === 'school') purpose = 'Partner school registration';
    else if (enrollmentType === 'online') purpose = 'Online school registration';
    else purpose = row.school_id ? 'School payment' : 'Platform payment';
  }

  let description = purpose;
  if (studentName && payerName && payerName.toLowerCase() !== studentName.toLowerCase()) {
    description = `${purpose} — ${studentName} (${payerName})`;
  } else if (studentName) {
    description = `${purpose} — ${studentName}`;
  } else if (payerName) {
    description = `${purpose} — ${payerName}`;
  } else if (invoiceNumber) {
    description = `${purpose} · Invoice ${invoiceNumber}`;
  }

  const method = paymentMethodLabel(row.payment_method);
  const source = `${(PAYMENT_TYPE_LABELS[sourceType] || sourceType.replaceAll('_', ' '))} via ${method}`;

  return {
    description,
    source,
    sourceType,
    payerName,
    studentName: studentName || null,
    contactEmail: parentEmail || null,
    contactPhone: parentPhone || null,
    programLabel,
  };
}
