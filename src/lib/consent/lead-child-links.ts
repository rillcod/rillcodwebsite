import type { SupabaseClient } from '@supabase/supabase-js';
import { looseNameMatch } from '@/lib/parent-claim/name-match';

type AnySupabase = SupabaseClient<any>;

export type LeadChildLinkStatus = 'candidate' | 'approved' | 'onboarded' | 'unlinked' | 'reverted';
export type LeadChildLinkSource =
  | 'legacy_backfill'
  | 'match_review'
  | 'staff_link'
  | 'onboarded'
  | 'result_scan'
  | 'bulk_portal'
  | 'parent_ownership_sync';

const ACTIVE_LINK_STATUSES = new Set<LeadChildLinkStatus>(['approved', 'onboarded']);

function submittedChildNames(responseData: Record<string, unknown> | null | undefined): string[] {
  const rd = responseData ?? {};
  if (Array.isArray(rd.children) && rd.children.length > 0) {
    return (rd.children as Array<Record<string, unknown>>).map((child) => String(child?.name ?? '').trim());
  }
  const primary = String(rd.child_name ?? '').trim();
  return primary ? [primary] : [];
}

function namesPlausiblyMatch(submitted: string, actual: string): boolean {
  if (!submitted.trim() || !actual.trim()) return false;
  return looseNameMatch(submitted, actual);
}

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

export function isActiveLeadChildLink(status: LeadChildLinkStatus | string | null | undefined): boolean {
  return ACTIVE_LINK_STATUSES.has(status as LeadChildLinkStatus);
}

/**
 * When a lead already has a matched parent, promote/create consent child links for
 * any of that parent's junction children whose names match the submitted slots.
 * This closes the gap where parent_student_links exists but the consent UI still
 * shows "Link Child" because form_lead_child_links / matched_student_id lagged.
 */
export async function syncLeadChildrenFromParentOwnership(
  admin: AnySupabase,
  lead: {
    id: string;
    matched_parent_id?: string | null;
    matched_student_id?: string | null;
    match_status?: string | null;
    response_data?: Record<string, unknown> | null;
  },
): Promise<{ synced: number; primaryPortalId: string | null }> {
  const parentId = lead.matched_parent_id;
  if (!parentId) return { synced: 0, primaryPortalId: lead.matched_student_id ?? null };

  const names = submittedChildNames(lead.response_data);
  if (names.length === 0) return { synced: 0, primaryPortalId: lead.matched_student_id ?? null };

  const { data: junction, error: junctionError } = await admin
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parentId);
  if (junctionError) throw junctionError;
  const studentIds = (junction ?? []).map((row) => row.student_id).filter(Boolean);
  if (studentIds.length === 0) return { synced: 0, primaryPortalId: lead.matched_student_id ?? null };

  const { data: students, error: studentsError } = await admin
    .from('students')
    .select('id, user_id, full_name')
    .in('id', studentIds);
  if (studentsError) throw studentsError;

  const owned = ((students ?? []) as Array<{ id: string; user_id: string | null; full_name: string | null }>)
    .filter((row) => row.user_id);

  const existing = await listLeadChildLinks(admin, lead.id);
  const usedPortalIds = new Set(
    existing
      .filter((link) => isActiveLeadChildLink(link.link_status) || link.link_status === 'candidate')
      .map((link) => link.student_portal_user_id),
  );
  const usedIndexes = new Set(
    existing
      .filter((link) => isActiveLeadChildLink(link.link_status))
      .map((link) => link.child_index),
  );

  let synced = 0;

  // Promote existing candidate rows that the parent already owns.
  for (const link of existing) {
    if (link.link_status !== 'candidate') continue;
    const ownedStudent = owned.find((row) => row.user_id === link.student_portal_user_id);
    if (!ownedStudent) continue;
    await upsertLeadChildLink(admin, {
      lead_id: lead.id,
      child_index: link.child_index,
      student_portal_user_id: link.student_portal_user_id,
      student_name: ownedStudent.full_name,
      student_class: link.student_class,
      link_status: 'approved',
      source: 'parent_ownership_sync',
      linked_by: null,
    });
    usedIndexes.add(link.child_index);
    usedPortalIds.add(link.student_portal_user_id);
    synced++;
  }

  // Fill empty submitted slots from remaining owned children by name or fallback to owned child
  for (let childIndex = 0; childIndex < names.length; childIndex++) {
    if (usedIndexes.has(childIndex)) continue;
    const submitted = names[childIndex];
    let match = owned.find((row) =>
      row.user_id
      && !usedPortalIds.has(row.user_id)
      && namesPlausiblyMatch(submitted, row.full_name ?? ''),
    );

    // Fallback: If no exact name match, but parent owns an un-synced student (e.g. slight spelling variation or 1 child), link it!
    if (!match?.user_id) {
      match = owned.find((row) => row.user_id && !usedPortalIds.has(row.user_id));
    }

    if (!match?.user_id) continue;

    await upsertLeadChildLink(admin, {
      lead_id: lead.id,
      child_index: childIndex,
      student_portal_user_id: match.user_id,
      student_name: match.full_name,
      student_class: null,
      link_status: 'approved',
      source: 'parent_ownership_sync',
      linked_by: null,
    });
    usedIndexes.add(childIndex);
    usedPortalIds.add(match.user_id);
    synced++;
  }

  const refreshed = await listLeadChildLinks(admin, lead.id);
  const primary = refreshed.find((link) =>
    link.child_index === 0 && isActiveLeadChildLink(link.link_status),
  );

  if (primary && (!lead.match_status || !['approved', 'auto_matched', 'matched'].includes(lead.match_status))) {
    const { error } = await admin.from('form_leads').update({
      match_status: 'approved',
      status: 'contacted',
    }).eq('id', lead.id);
    if (error) throw error;
  }

  return {
    synced,
    primaryPortalId: primary?.student_portal_user_id ?? lead.matched_student_id ?? null,
  };
}
