import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizeEmail(value?: string | null): string | null {
  const email = (value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeCustomerPhone(value?: string | null): string | null {
  const digits = (value || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const local = digits.slice(-10);
  return `+234${local.startsWith('0') ? local.slice(1) : local}`;
}

export async function resolveCustomerKey(
  db: SupabaseClient<any>,
  input: { portalUserId?: string | null; email?: string | null; phone?: string | null },
): Promise<{ customerKey: string; portalUserId: string | null }> {
  const identities = [
    input.portalUserId ? { type: 'portal_user', value: input.portalUserId, verified: true } : null,
    normalizeEmail(input.email) ? { type: 'email', value: normalizeEmail(input.email)!, verified: Boolean(input.portalUserId) } : null,
    normalizeCustomerPhone(input.phone) ? { type: 'phone', value: normalizeCustomerPhone(input.phone)!, verified: Boolean(input.portalUserId) } : null,
  ].filter(Boolean) as Array<{ type: string; value: string; verified: boolean }>;

  if (!identities.length) return { customerKey: crypto.randomUUID(), portalUserId: null };
  const clauses = identities.map((item) => `and(identity_type.eq.${item.type},identity_value.eq.${item.value})`).join(',');
  const { data: found } = await db.from('communication_customer_identities')
    .select('customer_key,portal_user_id,verified').or(clauses).order('verified', { ascending: false }).limit(10);
  const preferred = found?.find((row: any) => row.portal_user_id) || found?.[0];
  const customerKey = preferred?.customer_key || crypto.randomUUID();
  const portalUserId = input.portalUserId || preferred?.portal_user_id || null;

  for (const identity of identities) {
    await db.from('communication_customer_identities').upsert({
      customer_key: customerKey,
      identity_type: identity.type,
      identity_value: identity.value,
      portal_user_id: portalUserId,
      verified: identity.verified || Boolean(preferred?.verified),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity_type,identity_value' });
  }
  return { customerKey, portalUserId };
}
