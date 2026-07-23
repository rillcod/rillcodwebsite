/**
 * Classify a parent contact for CRM pipeline + book role.
 * Linked portal parents are won — not prospects.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CrmPipelineStage } from '@/lib/crm/stages';
import { normalizeCrmEmail, normalizeCrmPhone, phonesMatch } from '@/lib/crm/contact-book';

type AnySupabase = SupabaseClient<any>;

export type ParentCrmStatus = {
  portalParentId: string | null;
  portalParentName: string | null;
  linkedChildCount: number;
  pipelineStage: CrmPipelineStage;
  contactType: 'parent' | 'form_lead';
  bookRole: 'parent' | 'external';
  isKnownParent: boolean;
};

const DEFAULT_STATUS: ParentCrmStatus = {
  portalParentId: null,
  portalParentName: null,
  linkedChildCount: 0,
  pipelineStage: 'prospect',
  contactType: 'form_lead',
  bookRole: 'external',
  isKnownParent: false,
};

async function findPortalParent(
  sb: AnySupabase,
  email: string | null,
  phone: string | null,
): Promise<{ id: string; full_name: string | null } | null> {
  if (email) {
    const { data } = await sb
      .from('portal_users')
      .select('id, full_name')
      .eq('role', 'parent')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .eq('email', email)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (phone) {
    const canonical = normalizeCrmPhone(phone);
    if (canonical) {
      const { data } = await sb
        .from('portal_users')
        .select('id, full_name, phone')
        .eq('role', 'parent')
        .eq('is_active', true)
        .eq('is_deleted', false)
        .not('phone', 'is', null)
        .limit(200);
      const match = (data ?? []).find((row: { phone?: string | null }) => phonesMatch(row.phone, canonical));
      if (match?.id) return match;
    }
  }

  return null;
}

async function countLinkedChildren(sb: AnySupabase, parentPortalId: string): Promise<number> {
  const { count, error } = await sb
    .from('parent_student_links')
    .select('student_id', { count: 'exact', head: true })
    .eq('parent_id', parentPortalId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Resolve CRM stage for a parent/guardian by email or phone.
 * - Portal parent with linked child(ren) → won (enrolled family)
 * - Portal parent account, no link yet → active (contacted / in system)
 * - Unknown visitor → prospect
 */
export async function resolveParentCrmStatus(
  sb: AnySupabase,
  opts: { email?: string | null; phone?: string | null },
): Promise<ParentCrmStatus> {
  const email = normalizeCrmEmail(opts.email);
  const phone = normalizeCrmPhone(opts.phone);
  if (!email && !phone) return DEFAULT_STATUS;

  const portalParent = await findPortalParent(sb, email, phone);
  if (!portalParent) return DEFAULT_STATUS;

  const linkedChildCount = await countLinkedChildren(sb, portalParent.id);

  if (linkedChildCount > 0) {
    return {
      portalParentId: portalParent.id,
      portalParentName: portalParent.full_name,
      linkedChildCount,
      pipelineStage: pipelineStageForKnownParent(linkedChildCount),
      contactType: 'parent',
      bookRole: 'parent',
      isKnownParent: true,
    };
  }

  return {
    portalParentId: portalParent.id,
    portalParentName: portalParent.full_name,
    linkedChildCount: 0,
    pipelineStage: 'active',
    contactType: 'parent',
    bookRole: 'parent',
    isKnownParent: true,
  };
}

/** Pure stage picker — used by resolver and tests. */
export function pipelineStageForKnownParent(linkedChildCount: number): CrmPipelineStage {
  return linkedChildCount > 0 ? 'won' : 'active';
}
