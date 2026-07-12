/**
 * Single writer for crm_pipeline (+ optional interaction).
 * Always persists UI-vocabulary stages via normalizeCrmStage.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { crmStageRank, normalizeCrmStage, type CrmPipelineStage } from '@/lib/crm/stages';

type AnySupabase = SupabaseClient<any>;

export type UpsertPipelineParams = {
  contactId: string;
  contactName: string;
  contactType?: string;
  /** Desired stage (legacy aliases accepted; stored normalized). */
  stage: string;
  /** If true, never demote an already-further stage. Default true. */
  promoteOnly?: boolean;
  pipelineNotes?: string | null;
  updatedBy?: string | null;
  updatedByName?: string | null;
};

export async function upsertCrmPipeline(sb: AnySupabase, params: UpsertPipelineParams): Promise<CrmPipelineStage> {
  const now = new Date().toISOString();
  const desired = normalizeCrmStage(params.stage);
  const promoteOnly = params.promoteOnly !== false;

  const { data: pipe } = await sb
    .from('crm_pipeline')
    .select('id, stage')
    .eq('contact_id', params.contactId)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    contact_id: params.contactId,
    contact_name: params.contactName,
    contact_type: params.contactType || 'portal_user',
    updated_at: now,
  };
  if (params.pipelineNotes !== undefined) payload.pipeline_notes = params.pipelineNotes;
  if (params.updatedBy) payload.updated_by = params.updatedBy;
  if (params.updatedByName) payload.updated_by_name = params.updatedByName;

  if (pipe) {
    const current = normalizeCrmStage(pipe.stage);
    const next = promoteOnly && crmStageRank(current) > crmStageRank(desired) ? current : desired;
    await sb.from('crm_pipeline').update({ ...payload, stage: next }).eq('contact_id', params.contactId);
    return next;
  }

  await sb.from('crm_pipeline').insert({ ...payload, stage: desired, created_at: now });
  return desired;
}

export type InsertInteractionParams = {
  contactId: string;
  contactName: string;
  contactType?: string;
  type: string;
  direction?: string;
  content: string;
  staffId?: string | null;
  staffName?: string | null;
};

export async function insertCrmInteraction(sb: AnySupabase, params: InsertInteractionParams) {
  const now = new Date().toISOString();
  await sb.from('crm_interactions').insert({
    contact_id: params.contactId,
    contact_name: params.contactName,
    contact_type: params.contactType || 'portal_user',
    type: params.type,
    direction: params.direction || 'outbound',
    content: params.content,
    staff_id: params.staffId ?? null,
    staff_name: params.staffName ?? null,
    created_at: now,
  });
}
