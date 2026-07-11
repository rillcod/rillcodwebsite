import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureResultIntakeForm } from './intake-form';
import { upsertLeadChildLink } from '@/lib/consent/lead-child-links';

type AnySupabase = SupabaseClient<any>;

export type LeadCaptureInput = {
  schoolId: string;
  studentUserId: string;
  parentId: string;
  email: string;
  fullName: string;
  phone: string | null;
  relationship: string | null;
  childName: string | null;
  childGender?: string | null;
  childAge?: number | null;
  childDob?: string | null;
  whatsappOptIn?: boolean;
};

/**
 * Insert or refresh the Result Checker intake lead when a parent links (or re-links)
 * via QR — keeps staff records current without creating duplicates per child.
 */
export async function upsertResultCheckerLead(admin: AnySupabase, input: LeadCaptureInput): Promise<string | null> {
  const formId = await ensureResultIntakeForm(admin, input.schoolId);
  if (!formId) return null;

  const now = new Date().toISOString();
  const responsePatch = {
    parent_name: input.fullName,
    parent_email: input.email,
    parent_whatsapp: input.phone,
    relationship: input.relationship,
    child_name: input.childName,
    source: 'result_checker',
    _auto_linked: true,
    last_claim_at: now,
    ...(input.childGender ? { child_gender: input.childGender } : {}),
    ...(input.childAge != null ? { child_age: String(input.childAge) } : {}),
    ...(input.childDob ? { child_dob: input.childDob } : {}),
    ...(input.whatsappOptIn ? { parent_whatsapp_opt_in: true } : {}),
  };

  const { data: existing } = await admin
    .from('form_leads')
    .select('id, response_data')
    .eq('form_id', formId)
    .eq('matched_student_id', input.studentUserId)
    .maybeSingle();

  if (existing?.id) {
    const prior = (existing.response_data && typeof existing.response_data === 'object' && !Array.isArray(existing.response_data))
      ? existing.response_data as Record<string, unknown>
      : {};
    await admin.from('form_leads').update({
      email: input.email,
      matched_parent_id: input.parentId,
      match_status: 'approved',
      match_confidence: 'high',
      match_notes: 'Refreshed via result/ID-card scan (parent re-linked).',
      response_data: { ...prior, ...responsePatch },
    }).eq('id', existing.id);
    await upsertLeadChildLink(admin, {
      lead_id: existing.id,
      child_index: 0,
      student_portal_user_id: input.studentUserId,
      student_name: input.childName,
      student_class: null,
      link_status: 'approved',
      source: 'result_scan',
      linked_by: input.parentId,
    });
    return existing.id;
  }

  const { data: inserted } = await admin.from('form_leads').insert({
    form_id: formId,
    school_id: input.schoolId,
    email: input.email,
    response_data: responsePatch,
    matched_parent_id: input.parentId,
    match_status: 'approved',
    match_confidence: 'high',
    match_notes: 'Auto-linked via result/ID-card scan (exact child).',
  }).select('id').maybeSingle();

  if (inserted?.id) {
    await upsertLeadChildLink(admin, {
      lead_id: inserted.id,
      child_index: 0,
      student_portal_user_id: input.studentUserId,
      student_name: input.childName,
      student_class: null,
      link_status: 'approved',
      source: 'result_scan',
      linked_by: input.parentId,
    });
  }
  return inserted?.id ?? null;
}
