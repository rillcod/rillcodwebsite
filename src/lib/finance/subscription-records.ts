/** Map Finance Center subscription UI fields to/from public.subscriptions rows. */

export type SubscriptionFeatures = {
  billing_cycle_display?: string;
  term?: string;
  academic_year?: string;
};

export type SubscriptionUiRow = {
  id: string;
  school_id: string;
  plan_name: string;
  plan_type: string | null;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  currency: string;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  start_date: string;
  end_date: string | null;
  max_students: number | null;
  max_teachers: number | null;
  features: SubscriptionFeatures;
  created_at: string;
  schools?: { id: string; name: string; email: string } | null;
};

export type SubscriptionWriteInput = {
  school_id: string;
  plan_name: string;
  plan_type?: string | null;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  currency?: string;
  status?: SubscriptionUiRow['status'];
  start_date?: string | null;
  end_date?: string | null;
  max_students?: number | null;
  max_teachers?: number | null;
  features?: SubscriptionFeatures;
};

function parseSubscriptionFeatures(raw: unknown): SubscriptionFeatures {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  return {
    billing_cycle_display:
      typeof row.billing_cycle_display === 'string' ? row.billing_cycle_display : undefined,
    term: typeof row.term === 'string' ? row.term : undefined,
    academic_year: typeof row.academic_year === 'string' ? row.academic_year : undefined,
  };
}

function dateStartIso(value: string | null | undefined): string | null {
  const day = String(value || '').slice(0, 10);
  if (!day) return null;
  return `${day}T00:00:00.000Z`;
}

function dateEndIso(value: string | null | undefined): string | null {
  const day = String(value || '').slice(0, 10);
  if (!day) return null;
  return `${day}T23:59:59.999Z`;
}

export function normalizeSubscriptionRow(row: Record<string, unknown>): SubscriptionUiRow {
  const features = parseSubscriptionFeatures(row.features);

  return {
    id: String(row.id),
    school_id: String(row.school_id || ''),
    plan_name: String(row.plan_name || row.subscription_plan || 'School plan'),
    plan_type: row.plan_type ? String(row.plan_type) : null,
    billing_cycle: (row.billing_cycle as SubscriptionUiRow['billing_cycle']) || 'monthly',
    amount: Number(row.amount ?? row.fixed_amount ?? 0),
    currency: String(row.currency || 'NGN'),
    status: (row.status as SubscriptionUiRow['status']) || 'active',
    start_date: String(row.start_date || row.current_period_start || '').slice(0, 10),
    end_date: row.end_date
      ? String(row.end_date).slice(0, 10)
      : row.current_period_end
        ? String(row.current_period_end).slice(0, 10)
        : null,
    max_students: row.max_students == null ? null : Number(row.max_students),
    max_teachers: row.max_teachers == null ? null : Number(row.max_teachers),
    features,
    created_at: String(row.created_at || ''),
    schools: (row.schools as SubscriptionUiRow['schools']) ?? null,
  };
}

export function buildSubscriptionWritePayload(input: SubscriptionWriteInput): Record<string, unknown> {
  const planName = input.plan_name.trim();
  const amount = Number(input.amount || 0);
  const features = input.features ?? {};

  return {
    school_id: input.school_id,
    owner_type: 'school',
    plan_name: planName,
    subscription_plan: planName,
    plan_type: input.plan_type || 'standard',
    billing_cycle: input.billing_cycle,
    amount,
    fixed_amount: amount,
    pricing_model: 'fixed_school',
    currency: input.currency || 'NGN',
    status: input.status || 'active',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    current_period_start: dateStartIso(input.start_date),
    current_period_end: dateEndIso(input.end_date),
    max_students: input.max_students ?? null,
    max_teachers: input.max_teachers ?? null,
    features,
    updated_at: new Date().toISOString(),
  };
}
