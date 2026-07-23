/**
 * One-time / scheduled backfill: portal parents must not stay as prospects.
 * Linked children → won; portal account only → contacted (active).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { autoPromoteParentPipeline } from '@/lib/crm/auto-promote-parent';
import { upsertBookParent } from '@/lib/crm/contact-book';
import { upsertCrmPipeline } from '@/lib/crm/pipeline';
import { resolveParentCrmStatus } from '@/lib/crm/resolve-parent-stage';

type AnySupabase = SupabaseClient<any>;

export type ReconcileParentStagesResult = {
  portalParents: number;
  bookRowsUpdated: number;
  pipelinePromoted: number;
};

/** Reconcile all active portal parents + misclassified book rows. */
export async function reconcileKnownParentStages(sb: AnySupabase): Promise<ReconcileParentStagesResult> {
  let bookRowsUpdated = 0;
  let pipelinePromoted = 0;

  const { data: portalParents } = await sb
    .from('portal_users')
    .select('id, full_name, email, phone')
    .eq('role', 'parent')
    .eq('is_active', true)
    .eq('is_deleted', false);

  for (const parent of portalParents ?? []) {
    const result = await autoPromoteParentPipeline(sb, {
      parentId: parent.id,
      email: parent.email,
      phone: parent.phone,
      contactName: parent.full_name,
    });
    if (result.wasProspect && result.stage && result.stage !== 'prospect') pipelinePromoted++;
  }

  const { data: externalRows } = await sb
    .from('customer_contact_book')
    .select('id, full_name, email, phone, role, source, last_channel')
    .eq('role', 'external')
    .limit(500);

  for (const row of externalRows ?? []) {
    const status = await resolveParentCrmStatus(sb, { email: row.email, phone: row.phone });
    if (!status.isKnownParent || !status.portalParentId) continue;

    await upsertBookParent(sb, {
      fullName: row.full_name || status.portalParentName || 'Parent',
      email: row.email,
      phone: row.phone,
      role: 'parent',
      userId: status.portalParentId,
      source: row.source ?? 'portal',
      lastChannel: row.last_channel ?? 'portal',
      extraMeta: {
        is_known_parent: true,
        linked_child_count: status.linkedChildCount,
        portal_parent_id: status.portalParentId,
        parent_stage_reconciled_at: new Date().toISOString(),
      },
    });
    bookRowsUpdated++;

    await upsertCrmPipeline(sb, {
      contactId: status.portalParentId,
      contactName: row.full_name || status.portalParentName || 'Parent',
      contactType: 'parent',
      stage: status.pipelineStage,
      promoteOnly: true,
    });
  }

  return {
    portalParents: portalParents?.length ?? 0,
    bookRowsUpdated,
    pipelinePromoted,
  };
}
