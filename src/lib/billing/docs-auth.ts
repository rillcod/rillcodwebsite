import { createClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';

export type BillingDocsCaller = {
  id: string;
  role: string;
  school_id: string | null;
  full_name: string | null;
};

export async function requireBillingDocsCaller(opts?: { adminOnly?: boolean }): Promise<BillingDocsCaller | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('portal_users')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  if (opts?.adminOnly && data.role !== 'admin') return null;
  if (!opts?.adminOnly && !['admin', 'school'].includes(data.role)) return null;
  return data as BillingDocsCaller;
}

export function billingDocsDb() {
  return createEngagementAdminClient();
}
