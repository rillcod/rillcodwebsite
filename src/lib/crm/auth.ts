/**
 * Shared CRM / customer-book auth for Route Handlers.
 * One admin client + one caller shape across all CRM APIs.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCrmPlatformRole, isStaffRole } from '@/lib/server/api-rbac';
import type { CrmCaller } from '@/lib/crm/scope';

export type CrmStaffSession = {
  caller: CrmCaller;
  db: ReturnType<typeof createAdminClient>;
};

async function loadCaller(): Promise<{ caller: CrmCaller; db: ReturnType<typeof createAdminClient> } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role, full_name, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    db,
    caller: {
      id: profile.id,
      role: profile.role,
      school_id: profile.school_id ?? null,
      full_name: profile.full_name ?? null,
    },
  };
}

/** Admin + teacher only (CRM workspace). Throws Unauthorized / Forbidden. */
export async function requireCrmStaff(): Promise<CrmStaffSession> {
  const session = await loadCaller();
  if (!session) throw new Error('Unauthorized');
  if (!isCrmPlatformRole(session.caller.role)) throw new Error('Forbidden');
  return session;
}

/** Same as requireCrmStaff but returns null instead of throwing (403-style routes). */
export async function requireCrmStaffOrNull(): Promise<CrmStaffSession | null> {
  try {
    return await requireCrmStaff();
  } catch {
    return null;
  }
}

/** Admin + teacher + partner school (customer book directory). */
export async function requireCustomerBookCaller(): Promise<CrmStaffSession> {
  const session = await loadCaller();
  if (!session) throw new Error('Unauthorized');
  if (!isStaffRole(session.caller.role)) throw new Error('Forbidden');
  return session;
}

export async function requireCustomerBookCallerOrNull(): Promise<CrmStaffSession | null> {
  try {
    return await requireCustomerBookCaller();
  } catch {
    return null;
  }
}

export function crmAuthErrorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : 'Server error';
  const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
  return NextResponse.json({ error: msg }, { status });
}
