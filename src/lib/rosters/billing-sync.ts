type SupabaseAdmin = {
  from: (table: string) => any;
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const INVOICE_TO_ROSTER_STATUS: Record<string, string> = {
  draft: 'pending',
  sent: 'sent',
  paid: 'paid',
  overdue: 'overdue',
  cancelled: 'cancelled',
  void: 'void',
};

const CYCLE_TO_ROSTER_STATUS: Record<string, string> = {
  due: 'pending',
  past_due: 'overdue',
  paid: 'paid',
  cancelled: 'cancelled',
  rolled_over: 'rolled_over',
};

function normalizeBillingStatus(sourceStatus: string | null | undefined, source: 'invoice' | 'cycle') {
  const key = String(sourceStatus || '').trim().toLowerCase();
  return (source === 'invoice' ? INVOICE_TO_ROSTER_STATUS[key] : CYCLE_TO_ROSTER_STATUS[key]) || 'unknown';
}

async function termIdForBillingCycle(db: SupabaseAdmin, cycle: any) {
  if (!cycle?.term_start_date) return null;
  const { data } = await db.rpc?.('term_id_for_date', { p_date: String(cycle.term_start_date).slice(0, 10) }) ?? {};
  return data ?? null;
}

export async function syncRosterBillingForCycle(db: SupabaseAdmin, cycleId: string, status?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: cycle } = await db
    .from('billing_cycles')
    .select('id, status, invoice_id, owner_school_id, owner_user_id, school_id, owner_type, subscription_id, term_start_date')
    .eq('id', cycleId)
    .maybeSingle();
  if (!cycle) return { ok: false, error: 'Billing cycle not found for roster sync' };

  const now = new Date().toISOString();
  const billingStatus = normalizeBillingStatus(status ?? cycle.status, 'cycle');
  const termId = await termIdForBillingCycle(db, cycle);
  const payload = {
    billing_status: billingStatus,
    billing_cycle_id: cycle.id,
    invoice_id: cycle.invoice_id ?? null,
    subscription_id: cycle.subscription_id ?? null,
    billing_checked_at: now,
    access_suspended_at: billingStatus === 'overdue' ? now : null,
    access_suspension_reason: billingStatus === 'overdue' ? 'billing_overdue' : null,
    updated_at: now,
  };

  let query = db.from('class_term_rosters').update(payload);
  if (cycle.owner_type === 'individual' && cycle.owner_user_id) {
    query = query.eq('student_id', cycle.owner_user_id);
  } else {
    const schoolId = cycle.owner_school_id ?? cycle.school_id;
    if (!schoolId) return { ok: false, error: 'Billing cycle has no school owner for roster sync' };
    query = query.eq('school_id', schoolId);
  }
  if (termId) query = query.eq('term_id', termId);
  const { error } = await query;
  if (error?.code !== '42P01' && error?.code !== '42703' && error) {
    console.warn('[class_term_rosters] billing cycle sync failed', error);
    return { ok: false, error: error.message || 'Roster billing sync failed' };
  }
  return { ok: true };
}

export async function syncRosterBillingForInvoice(db: SupabaseAdmin, invoiceId: string, status?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: invoice } = await db
    .from('invoices')
    .select('id, status, portal_user_id, school_id, billing_cycle_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: 'Invoice not found for roster sync' };

  if (invoice.billing_cycle_id) {
    return syncRosterBillingForCycle(db, invoice.billing_cycle_id, status ?? invoice.status);
  }

  const now = new Date().toISOString();
  const billingStatus = normalizeBillingStatus(status ?? invoice.status, 'invoice');
  const payload = {
    billing_status: billingStatus,
    invoice_id: invoice.id,
    billing_checked_at: now,
    access_suspended_at: billingStatus === 'overdue' ? now : null,
    access_suspension_reason: billingStatus === 'overdue' ? 'billing_overdue' : null,
    updated_at: now,
  };

  let query = db.from('class_term_rosters').update(payload);
  if (invoice.portal_user_id) query = query.eq('student_id', invoice.portal_user_id);
  else if (invoice.school_id) query = query.eq('school_id', invoice.school_id);
  else return { ok: true };

  const { error } = await query;
  if (error?.code !== '42P01' && error?.code !== '42703' && error) {
    console.warn('[class_term_rosters] invoice sync failed', error);
    return { ok: false, error: error.message || 'Roster billing sync failed' };
  }
  return { ok: true };
}

export async function defaultRosterBillingPayload(db: SupabaseAdmin, cls: { school_id?: string | null }) {
  if (!cls.school_id) {
    return { billing_status: 'unknown', subscription_status: 'unknown', billing_checked_at: new Date().toISOString() };
  }
  const { data: sub } = await db
    .from('subscriptions')
    .select('id, status')
    .eq('school_id', cls.school_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    billing_status: 'pending',
    subscription_status: sub?.status ?? 'unknown',
    subscription_id: sub?.id ?? null,
    billing_checked_at: new Date().toISOString(),
  };
}

export async function syncRosterSubscriptionStatus(db: SupabaseAdmin, subscriptionId: string, status?: string | null) {
  const { data: sub } = await db
    .from('subscriptions')
    .select('id, school_id, status')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (!sub?.school_id) return;

  const now = new Date().toISOString();
  const subscriptionStatus = status ?? sub.status ?? 'unknown';
  const suspended = ['past_due', 'suspended', 'cancelled', 'expired'].includes(String(subscriptionStatus));
  const { error } = await db
    .from('class_term_rosters')
    .update({
      subscription_id: sub.id,
      subscription_status: subscriptionStatus,
      billing_checked_at: now,
      access_suspended_at: suspended ? now : null,
      access_suspension_reason: suspended ? `subscription_${subscriptionStatus}` : null,
      updated_at: now,
    })
    .eq('school_id', sub.school_id)
    .eq('status', 'active');

  if (error?.code !== '42P01' && error?.code !== '42703' && error) {
    console.warn('[class_term_rosters] subscription sync failed', error);
  }
}

