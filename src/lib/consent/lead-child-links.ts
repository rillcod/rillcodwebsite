import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type LeadChildLinkStatus = 'candidate' | 'approved' | 'onboarded' | 'unlinked' | 'reverted';
export type LeadChildLinkSource =
  | 'legacy_backfill'
  | 'match_review'
  | 'staff_link'
  | 'onboarded'
  | 'result_scan'
  | 'bulk_portal';

export type LeadChildLink = {
  id?: string;
  lead_id: string;
  child_index: number;
  student_portal_user_id: string;
  student_name: string | null;
  student_class: string | null;
  link_status: LeadChildLinkStatus;
  source: LeadChildLinkSource;
  linked_by: string | null;
  linked_at?: string;
};

type StoredLeadChildLink = Omit<LeadChildLink, 'student_name' | 'student_class' | 'link_status'> & {
  status: LeadChildLinkStatus;
  metadata: Record<string, unknown> | null;
};

function fromStored(row: StoredLeadChildLink): LeadChildLink {
  return {
    ...row,
    link_status: row.status,
    student_name: typeof row.metadata?.student_name === 'string' ? row.metadata.student_name : null,
    student_class: typeof row.metadata?.student_class === 'string' ? row.metadata.student_class : null,
  };
}

export async function listLeadChildLinks(
  admin: AnySupabase,
  leadId: string,
): Promise<LeadChildLink[]> {
  const { data, error } = await admin
    .from('form_lead_child_links')
    .select('id, lead_id, child_index, student_portal_user_id, status, source, linked_by, linked_at, metadata')
    .eq('lead_id', leadId)
    .order('child_index');
  if (error) throw error;
  return ((data ?? []) as StoredLeadChildLink[]).map(fromStored);
}

export async function listLeadChildLinksForLeads(
  admin: AnySupabase,
  leadIds: string[],
): Promise<Record<string, LeadChildLink[]>> {
  if (leadIds.length === 0) return {};
  const { data, error } = await admin
    .from('form_lead_child_links')
    .select('id, lead_id, child_index, student_portal_user_id, status, source, linked_by, linked_at, metadata')
    .in('lead_id', leadIds)
    .order('child_index');
  if (error) throw error;
  const grouped: Record<string, LeadChildLink[]> = {};
  for (const stored of (data ?? []) as StoredLeadChildLink[]) {
    const row = fromStored(stored);
    (grouped[row.lead_id] ??= []).push(row);
  }
  return grouped;
}

export async function upsertLeadChildLink(
  admin: AnySupabase,
  link: Omit<LeadChildLink, 'id' | 'linked_at'>,
): Promise<LeadChildLink> {
  if (!Number.isInteger(link.child_index) || link.child_index < 0) {
    throw new Error('child_index must be a non-negative integer');
  }
  const { data, error } = await admin
    .from('form_lead_child_links')
    .upsert({
      lead_id: link.lead_id,
      child_index: link.child_index,
      student_portal_user_id: link.student_portal_user_id,
      status: link.link_status,
      source: link.source,
      linked_by: link.linked_by,
      metadata: {
        student_name: link.student_name,
        student_class: link.student_class,
      },
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lead_id,child_index' })
    .select('id, lead_id, child_index, student_portal_user_id, status, source, linked_by, linked_at, metadata')
    .single();
  if (error) throw error;
  return fromStored(data as StoredLeadChildLink);
}

export async function clearLeadChildLinks(admin: AnySupabase, leadId: string): Promise<void> {
  const { error } = await admin.from('form_lead_child_links').delete().eq('lead_id', leadId);
  if (error) throw error;
}

export async function removeLeadChildLink(
  admin: AnySupabase,
  leadId: string,
  childIndex: number,
): Promise<void> {
  const { error } = await admin
    .from('form_lead_child_links')
    .delete()
    .eq('lead_id', leadId)
    .eq('child_index', childIndex);
  if (error) throw error;
}

export async function removeStudentFromParentLeadLinks(
  admin: AnySupabase,
  parentId: string,
  studentPortalUserId: string,
): Promise<void> {
  const { data: leads, error: leadError } = await admin
    .from('form_leads')
    .select('id')
    .eq('matched_parent_id', parentId);
  if (leadError) throw leadError;
  const leadIds = (leads ?? []).map((lead) => lead.id);
  if (leadIds.length === 0) return;
  const { error } = await admin
    .from('form_lead_child_links')
    .delete()
    .in('lead_id', leadIds)
    .eq('student_portal_user_id', studentPortalUserId);
  if (error) throw error;
}

export async function collectLeadStudentPortalIds(
  admin: AnySupabase,
  leadId: string,
): Promise<string[]> {
  const links = await listLeadChildLinks(admin, leadId);
  return [...new Set(links.map((link) => link.student_portal_user_id).filter(Boolean))];
}
