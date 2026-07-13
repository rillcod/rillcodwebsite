type LedgerInput = {
  payment_method?: unknown; school_id?: unknown; portal_user_id?: unknown;
  payment_gateway_response?: unknown; portal_users?: { full_name?: unknown } | null;
  courses?: { title?: unknown } | null;
  invoices?: { invoice_number?: unknown; items?: unknown; billing_cycle_id?: unknown; stream?: unknown } | null;
};

function clean(value: unknown): string { return String(value ?? '').trim(); }

export function describeLedgerEntry(row: LedgerInput): { description: string; source: string; sourceType: string } {
  const metadata = row.payment_gateway_response && typeof row.payment_gateway_response === 'object' && !Array.isArray(row.payment_gateway_response)
    ? row.payment_gateway_response as Record<string, unknown> : {};
  const invoice = row.invoices || null;
  const items = Array.isArray(invoice?.items) ? invoice.items as Array<Record<string, unknown>> : [];
  const itemDescription = clean(items[0]?.description);
  const paymentType = clean(metadata.payment_type).toLowerCase();
  const payer = clean(row.portal_users?.full_name);
  const invoiceNumber = clean(invoice?.invoice_number);
  const course = clean(row.courses?.title);

  let sourceType = paymentType || (invoice?.billing_cycle_id ? 'billing_cycle' : invoiceNumber ? 'invoice' : course ? 'course' : row.school_id ? 'school' : 'individual');
  let purpose = itemDescription || course;
  if (!purpose) {
    const labels: Record<string, string> = {
      registration: 'Student registration',
      special_program: 'Special programme tuition',
      special_program_balance: 'Special programme balance',
      summer_school: 'Special programme tuition',
      summer_school_balance: 'Special programme balance',
      billing_cycle: 'School billing cycle',
      invoice_payment: 'Invoice payment',
      subscription: 'Subscription payment',
    };
    purpose = labels[sourceType] || (row.school_id ? 'School payment' : 'Platform payment');
  }
  const context = invoiceNumber ? `Invoice ${invoiceNumber}` : payer;
  const description = context && !purpose.toLowerCase().includes(context.toLowerCase()) ? `${purpose} - ${context}` : purpose;
  const method = clean(row.payment_method).replaceAll('_', ' ') || 'unknown method';
  const source = `${sourceType.replaceAll('_', ' ')} via ${method}`;
  return { description, source, sourceType };
}