/**
 * Automatically promote portal parents out of prospect.
 * Linked children → won; portal account only → contacted (active).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertBookParent } from '@/lib/crm/contact-book';
import { upsertCrmPipeline } from '@/lib/crm/pipeline';
import { resolveParentCrmStatus } from '@/lib/crm/resolve-parent-stage';
import type { CrmPipelineStage } from '@/lib/crm/stages';

type AnySupabase = SupabaseClient<any>;

export type AutoPromoteParentResult = {
  applied: boolean;
  portalParentId: string | null;
  stage: CrmPipelineStage | null;
  wasProspect: boolean;
};

/** Apply resolved CRM stage for one portal parent (by id or email/phone). */
export async function autoPromoteParentPipeline(
  sb: AnySupabase,
  opts: {
    parentId?: string | null;
    email?: string | null;
    phone?: string | null;
    contactName?: string | null;
    /** Use after explicit child link — always set won when linked. */
    forceStage?: boolean;
  },
): Promise<AutoPromoteParentResult> {
  let email = opts.email ?? null;
  let phone = opts.phone ?? null;
  let contactName = opts.contactName ?? null;
  let parentId = opts.parentId ?? null;

  if (parentId && (!email && !phone)) {
    const { data: parent } = await sb
      .from('portal_users')
      .select('id, full_name, email, phone')
      .eq('id', parentId)
      .eq('role', 'parent')
      .maybeSingle();
    if (parent) {
      email = parent.email;
      phone = parent.phone;
      contactName = contactName || parent.full_name;
      parentId = parent.id;
    }
  }

  const status = await resolveParentCrmStatus(sb, { email, phone });
  if (!status.isKnownParent || !status.portalParentId) {
    return { applied: false, portalParentId: null, stage: null, wasProspect: false };
  }

  parentId = status.portalParentId;
  contactName = contactName || status.portalParentName || 'Parent';

  const { data: before } = await sb
    .from('crm_pipeline')
    .select('stage')
    .eq('contact_id', parentId)
    .maybeSingle();

  const wasProspect = !before?.stage || before.stage === 'prospect';

  await upsertCrmPipeline(sb, {
    contactId: parentId,
    contactName,
    contactType: 'parent',
    stage: status.pipelineStage,
    promoteOnly: !opts.forceStage,
  });

  await upsertBookParent(sb, {
    fullName: contactName,
    email,
    phone,
    role: 'parent',
    userId: parentId,
    source: 'portal',
    lastChannel: 'portal',
    extraMeta: {
      is_known_parent: true,
      linked_child_count: status.linkedChildCount,
      portal_parent_id: parentId,
      parent_stage_auto_promoted_at: new Date().toISOString(),
    },
  });

  return {
    applied: true,
    portalParentId: parentId,
    stage: status.pipelineStage,
    wasProspect,
  };
}
