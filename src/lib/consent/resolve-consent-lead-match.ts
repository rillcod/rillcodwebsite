import type { SupabaseClient } from '@supabase/supabase-js';
import { looseNameMatch } from '@/lib/parent-claim/name-match';
import {
  isParentLinkConflict,
  resolveStudentRowId,
  syncExplicitParentStudentLink,
} from '@/lib/parents/links';
import {
  harmonizeStudentParentIdentity,
  syncParentContactAcrossStores,
  syncStudentFromLeadResponse,
} from '@/lib/sync/student-parent-identity';
import { logAudit } from '@/lib/audit/log';
import {
  listLeadChildLinks,
  upsertLeadChildLink,
  type LeadChildLink,
} from '@/lib/consent/lead-child-links';

type AnySupabase = SupabaseClient<any>;

export type ConsentMatchConfidence = 'high' | 'medium' | 'low';
export type ConsentResolveSource = 'auto' | 'staff_approve' | 'staff_portal' | 'staff_link';

export type ResolveConsentMatchOk = {
  ok: true;
  matchStatus: 'approved' | 'auto_matched';
  studentPortalId: string;
  parentPortalId: string | null;
};

export type ResolveConsentMatchFail = {
  ok: false;
  code: string;
  message: string;
};

export type ResolveConsentMatchResult = ResolveConsentMatchOk | ResolveConsentMatchFail;

/** Parent-supplied child name for a given slot on a consent lead. */
export function submittedChildNameForIndex(
  responseData: Record<string, unknown>,
  childIndex: number,
): string {
  const childrenArr = Array.isArray(responseData.children)
    ? (responseData.children as Array<Record<string, string>>)
    : null;
  const fromArray = childrenArr?.[childIndex]?.name?.trim();
  if (fromArray) return fromArray;
  if (childIndex === 0) return String(responseData.child_name ?? '').trim();
  return '';
}

/** Safe to auto-link existing student (consent name fixes spelling — no new account). */
export function isAutoResolvableConsentMatch(params: {
  submittedName: string;
  candidateName: string;
  parentMatch: boolean;
  confidence: ConsentMatchConfidence;
  parentPortalVerified: boolean;
}): boolean {
  if (!looseNameMatch(params.submittedName, params.candidateName)) return false;
  if (params.parentMatch) return true;
  if (params.confidence === 'high' && params.parentPortalVerified) return true;
  return false;
}

export async function findParentPortalIdByContact(
  admin: AnySupabase,
  parentEmail: string,
  parentPhone: string,
): Promise<string | null> {
  const email = parentEmail.trim().toLowerCase();
  const phone = parentPhone.replace(/\D/g, '');
  if (email) {
    const { data } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'parent')
      .eq('email', email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (phone.length >= 9) {
    const { data } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'parent')
      .ilike('phone', `%${phone.slice(-9)}%`)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function studentLinkedToDifferentParent(
  admin: AnySupabase,
  studentPortalUserId: string,
  submittedParentEmail: string,
  submittedParentPhone: string,
): Promise<{ blocked: true; parentId: string } | { blocked: false }> {
  const studentRowId = await resolveStudentRowId(admin, studentPortalUserId);
  if (!studentRowId) return { blocked: false };

  const { data: parentLink } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', studentRowId)
    .maybeSingle();
  if (!parentLink?.parent_id) return { blocked: false };

  const { data: linkedParent } = await admin
    .from('portal_users')
    .select('id, email, phone')
    .eq('id', parentLink.parent_id)
    .maybeSingle();

  const linkedEmail = String(linkedParent?.email ?? '').trim().toLowerCase();
  const linkedPhone = String(linkedParent?.phone ?? '').replace(/\D/g, '');
  const submittedEmail = submittedParentEmail.trim().toLowerCase();
  const submittedPhone = submittedParentPhone.replace(/\D/g, '');
  const sameParent =
    (!!submittedEmail && linkedEmail === submittedEmail)
    || (!!submittedPhone && !!linkedPhone && linkedPhone.endsWith(submittedPhone.slice(-9)));

  if (sameParent) return { blocked: false };
  return { blocked: true, parentId: parentLink.parent_id };
}

async function resolveParentForConsentLead(
  admin: AnySupabase,
  params: {
    parentEmail: string;
    parentPhone: string;
    candidateStudentPortalId: string;
  },
): Promise<string | null> {
  const fromContact = await findParentPortalIdByContact(admin, params.parentEmail, params.parentPhone);
  if (fromContact) return fromContact;

  const studentRowId = await resolveStudentRowId(admin, params.candidateStudentPortalId);
  if (!studentRowId) return null;

  const { data: parentLink } = await admin
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', studentRowId)
    .maybeSingle();
  if (parentLink?.parent_id) return parentLink.parent_id;

  const { data: student } = await admin
    .from('students')
    .select('parent_email')
    .eq('id', studentRowId)
    .maybeSingle();
  if (!student?.parent_email) return null;

  const { data: parentByEmail } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', student.parent_email)
    .eq('role', 'parent')
    .maybeSingle();
  return parentByEmail?.id ?? null;
}

/**
 * Link an existing student to this consent lead and apply parent-supplied spelling
 * (consent is source of truth). Never creates a new student account.
 */
export async function resolveConsentLeadMatch(
  admin: AnySupabase,
  params: {
    leadId: string;
    studentPortalUserId: string;
    childIndex?: number;
    actorId?: string | null;
    source: ConsentResolveSource;
    parentMatch?: boolean;
    confidence?: ConsentMatchConfidence;
  },
): Promise<ResolveConsentMatchResult> {
  const childIndex = params.childIndex ?? 0;
  const matchStatus: 'approved' | 'auto_matched' = params.source === 'auto' ? 'auto_matched' : 'approved';

  const { data: lead } = await admin
    .from('form_leads')
    .select('id, school_id, response_data, email, contact_id, match_candidate_id')
    .eq('id', params.leadId)
    .single();
  if (!lead) {
    return { ok: false, code: 'LEAD_NOT_FOUND', message: 'Consent lead not found.' };
  }

  const rd = (lead.response_data ?? {}) as Record<string, unknown>;
  const parentEmail = String(rd.parent_email ?? lead.email ?? '').trim();
  const parentPhone = String(rd.parent_whatsapp ?? rd.parent_phone ?? '').trim();
  const submittedName = submittedChildNameForIndex(rd, childIndex);

  const { data: candidatePortal } = await admin
    .from('portal_users')
    .select('id, full_name, role')
    .eq('id', params.studentPortalUserId)
    .maybeSingle();
  if (!candidatePortal || candidatePortal.role !== 'student') {
    return { ok: false, code: 'INVALID_CANDIDATE', message: 'Suggested student account is not valid.' };
  }

  if (submittedName && !looseNameMatch(submittedName, candidatePortal.full_name ?? '')) {
    return {
      ok: false,
      code: 'NAME_MISMATCH',
      message: 'Submitted child name does not plausibly match the existing student.',
    };
  }

  const ownership = await studentLinkedToDifferentParent(
    admin,
    params.studentPortalUserId,
    parentEmail,
    parentPhone,
  );
  if (ownership.blocked) {
    return {
      ok: false,
      code: 'STUDENT_ALREADY_LINKED',
      message: 'This student is already linked to another parent. Review manually before linking.',
    };
  }

  const parentPortalVerified = !!(await findParentPortalIdByContact(admin, parentEmail, parentPhone));
  if (
    params.source === 'auto'
    && !isAutoResolvableConsentMatch({
      submittedName: submittedName || candidatePortal.full_name || '',
      candidateName: candidatePortal.full_name || '',
      parentMatch: params.parentMatch ?? false,
      confidence: params.confidence ?? 'low',
      parentPortalVerified,
    })
  ) {
    return {
      ok: false,
      code: 'AUTO_RESOLVE_NOT_ELIGIBLE',
      message: 'Match requires staff review before linking.',
    };
  }

  const candidateStudentRowId = await resolveStudentRowId(admin, params.studentPortalUserId);
  if (!candidateStudentRowId) {
    return { ok: false, code: 'NO_STUDENT_ROW', message: 'The matched student has no operational record.' };
  }

  const matchedParentId = await resolveParentForConsentLead(admin, {
    parentEmail,
    parentPhone,
    candidateStudentPortalId: params.studentPortalUserId,
  });

  if (matchedParentId) {
    try {
      await syncExplicitParentStudentLink(admin, matchedParentId, candidateStudentRowId);
    } catch (error) {
      if (isParentLinkConflict(error)) {
        return { ok: false, code: error.code, message: error.message };
      }
      throw error;
    }
  }

  const linkSource = params.source === 'auto'
    ? 'match_review'
    : params.source === 'staff_link'
      ? 'staff_link'
      : 'match_review';

  await upsertLeadChildLink(admin, {
    lead_id: params.leadId,
    child_index: childIndex,
    student_portal_user_id: params.studentPortalUserId,
    student_name: submittedName || candidatePortal.full_name || null,
    student_class: String(rd.child_class ?? '').trim() || null,
    link_status: 'approved',
    source: linkSource,
    linked_by: params.actorId ?? null,
  });

  const { error: leadUpdateErr } = await admin.from('form_leads').update({
    match_status: matchStatus,
    status: 'contacted',
    matched_parent_id: matchedParentId,
    match_candidate_id: childIndex === 0 ? params.studentPortalUserId : lead.match_candidate_id,
  }).eq('id', params.leadId);
  if (leadUpdateErr) {
    return { ok: false, code: 'LEAD_UPDATE_FAILED', message: leadUpdateErr.message };
  }

  const childSlice = childIndex === 0
    ? rd
    : {
        ...rd,
        child_name: submittedName,
        child_class: (Array.isArray(rd.children)
          ? (rd.children as Array<Record<string, string>>)[childIndex]?.class
          : '') || rd.child_class,
        child_gender: (Array.isArray(rd.children)
          ? (rd.children as Array<Record<string, string>>)[childIndex]?.gender
          : '') || rd.child_gender,
        child_age: (Array.isArray(rd.children)
          ? (rd.children as Array<Record<string, string>>)[childIndex]?.age
          : '') || rd.child_age,
      };

  await syncStudentFromLeadResponse(
    admin,
    params.studentPortalUserId,
    childSlice as Record<string, unknown>,
    'overwrite',
  );

  if (matchedParentId) {
    await syncParentContactAcrossStores(admin, matchedParentId, {
      full_name: String(rd.parent_name ?? '').trim() || undefined,
      email: parentEmail || undefined,
      phone: parentPhone || undefined,
    });
  }

  await harmonizeStudentParentIdentity(admin, {
    studentUserId: params.studentPortalUserId,
    parentId: matchedParentId,
    parentPhone: parentPhone || null,
  });

  await logAudit(admin, {
    action: params.source === 'auto' ? 'consent_auto_matched' : 'consent_match_approved',
    actorId: params.actorId ?? null,
    resourceType: 'form_lead',
    resourceId: params.leadId,
    newValues: {
      student_portal_id: params.studentPortalUserId,
      parent_id: matchedParentId,
      child_index: childIndex,
      match_status: matchStatus,
    },
  });

  return {
    ok: true,
    matchStatus,
    studentPortalId: params.studentPortalUserId,
    parentPortalId: matchedParentId,
  };
}

function candidateLinks(links: LeadChildLink[]): LeadChildLink[] {
  return links.filter((link) => link.link_status === 'candidate');
}

/** Try auto/staff-safe resolution for pending candidate slots on a lead. */
export async function resolveEligiblePendingConsentMatches(
  admin: AnySupabase,
  leadId: string,
  opts: {
    source: 'auto' | 'staff_portal';
    actorId?: string | null;
    parentMatchByPortalId?: Map<string, boolean>;
    confidence?: ConsentMatchConfidence;
  },
): Promise<{ resolved: number; failures: ResolveConsentMatchFail[] }> {
  const { data: lead } = await admin
    .from('form_leads')
    .select('id, match_candidate_id, match_confidence, response_data')
    .eq('id', leadId)
    .single();
  if (!lead) return { resolved: 0, failures: [] };

  const rd = (lead.response_data ?? {}) as Record<string, unknown>;
  const links = await listLeadChildLinks(admin, leadId);
  const pending = candidateLinks(links);

  const targets: Array<{ childIndex: number; studentPortalUserId: string; parentMatch: boolean }> = [];

  if (lead.match_candidate_id && !pending.some((l) => l.child_index === 0)) {
    targets.push({
      childIndex: 0,
      studentPortalUserId: lead.match_candidate_id,
      parentMatch: opts.parentMatchByPortalId?.get(lead.match_candidate_id) ?? false,
    });
  }

  for (const link of pending) {
    targets.push({
      childIndex: link.child_index,
      studentPortalUserId: link.student_portal_user_id,
      parentMatch: opts.parentMatchByPortalId?.get(link.student_portal_user_id) ?? false,
    });
  }

  let resolved = 0;
  const failures: ResolveConsentMatchFail[] = [];
  const confidence = (lead.match_confidence as ConsentMatchConfidence | null) ?? opts.confidence ?? 'low';

  for (const target of targets) {
    const submittedName = submittedChildNameForIndex(rd, target.childIndex);
    const { data: portalStudent } = await admin
      .from('portal_users')
      .select('full_name')
      .eq('id', target.studentPortalUserId)
      .maybeSingle();
    const candidateName = portalStudent?.full_name ?? '';

    const parentPortalVerified = !!(await findParentPortalIdByContact(
      admin,
      String(rd.parent_email ?? '').trim(),
      String(rd.parent_whatsapp ?? rd.parent_phone ?? '').trim(),
    ));

    if (
      (opts.source === 'auto' || opts.source === 'staff_portal')
      && !isAutoResolvableConsentMatch({
        submittedName,
        candidateName,
        parentMatch: target.parentMatch,
        confidence,
        parentPortalVerified,
      })
    ) {
      continue;
    }

    const result = await resolveConsentLeadMatch(admin, {
      leadId,
      studentPortalUserId: target.studentPortalUserId,
      childIndex: target.childIndex,
      actorId: opts.actorId ?? null,
      source: opts.source === 'auto' ? 'auto' : 'staff_portal',
      parentMatch: target.parentMatch,
      confidence,
    });
    if (result.ok) {
      resolved++;
    } else if (result.code !== 'AUTO_RESOLVE_NOT_ELIGIBLE') {
      failures.push(result);
    }
  }

  return { resolved, failures };
}

/**
 * Block creating brand-new student accounts while unresolved "same child" suggestions exist.
 * Optionally resolves eligible matches first (staff portal / auto submit).
 */
export async function assertSafeToOnboardNewStudents(
  admin: AnySupabase,
  leadId: string,
  opts?: {
    tryResolveFirst?: boolean;
    actorId?: string | null;
    source?: 'auto' | 'staff_portal';
    parentMatchByPortalId?: Map<string, boolean>;
    confidence?: ConsentMatchConfidence;
  },
): Promise<{ ok: true } | ResolveConsentMatchFail> {
  if (opts?.tryResolveFirst) {
    await resolveEligiblePendingConsentMatches(admin, leadId, {
      source: opts.source ?? 'staff_portal',
      actorId: opts.actorId ?? null,
      parentMatchByPortalId: opts.parentMatchByPortalId,
      confidence: opts.confidence,
    });
  }

  const { data: lead } = await admin
    .from('form_leads')
    .select('id, match_status, match_candidate_id')
    .eq('id', leadId)
    .single();
  if (!lead) {
    return { ok: false, code: 'LEAD_NOT_FOUND', message: 'Consent lead not found.' };
  }

  const links = await listLeadChildLinks(admin, leadId);
  const unresolvedCandidates = candidateLinks(links);

  if (lead.match_status === 'pending_review' || unresolvedCandidates.length > 0) {
    return {
      ok: false,
      code: 'CONSENT_MATCH_PENDING',
      message:
        'This consent form may match an existing student. Approve the suggested match (or reject it) before creating new student accounts — that avoids duplicates.',
    };
  }

  return { ok: true };
}

/**
 * Resolve safe pending matches, then block new student creation if duplicates may exist.
 * Returns a refreshed lead row when onboarding may proceed.
 */
export async function prepareLeadForStudentOnboard(
  admin: AnySupabase,
  leadId: string,
  actorId?: string | null,
): Promise<{ ok: true; lead: Record<string, unknown> } | ResolveConsentMatchFail> {
  await resolveEligiblePendingConsentMatches(admin, leadId, {
    source: 'staff_portal',
    actorId: actorId ?? null,
  });

  const safety = await assertSafeToOnboardNewStudents(admin, leadId);
  if (!safety.ok) return safety;

  const { data: lead, error } = await admin
    .from('form_leads')
    .select('id, form_id, school_id, matched_school_id, email, response_data, matched_student_id, matched_parent_id, match_status, match_candidate_id')
    .eq('id', leadId)
    .single();
  if (error || !lead) {
    return { ok: false, code: 'LEAD_NOT_FOUND', message: 'Consent lead not found.' };
  }
  return { ok: true, lead: lead as Record<string, unknown> };
}

/** Apply parent-supplied spelling to every student already linked on this lead. */
export async function applyConsentSpellingToLinkedStudents(
  admin: AnySupabase,
  leadId: string,
): Promise<number> {
  const { data: lead } = await admin
    .from('form_leads')
    .select('id, matched_student_id, response_data')
    .eq('id', leadId)
    .single();
  if (!lead) return 0;

  const rd = (lead.response_data ?? {}) as Record<string, unknown>;
  const links = await listLeadChildLinks(admin, leadId);
  const active = links.filter((l) => l.link_status === 'approved' || l.link_status === 'onboarded');

  const targets: Array<{ childIndex: number; studentPortalUserId: string }> = active.map((l) => ({
    childIndex: l.child_index,
    studentPortalUserId: l.student_portal_user_id,
  }));

  if (targets.length === 0 && lead.matched_student_id) {
    targets.push({ childIndex: 0, studentPortalUserId: lead.matched_student_id as string });
  }

  let applied = 0;
  for (const target of targets) {
    const childSlice = target.childIndex === 0
      ? rd
      : {
          ...rd,
          child_name: submittedChildNameForIndex(rd, target.childIndex),
          child_class: (Array.isArray(rd.children)
            ? (rd.children as Array<Record<string, string>>)[target.childIndex]?.class
            : '') || rd.child_class,
          child_gender: (Array.isArray(rd.children)
            ? (rd.children as Array<Record<string, string>>)[target.childIndex]?.gender
            : '') || rd.child_gender,
          child_age: (Array.isArray(rd.children)
            ? (rd.children as Array<Record<string, string>>)[target.childIndex]?.age
            : '') || rd.child_age,
        };
    await syncStudentFromLeadResponse(
      admin,
      target.studentPortalUserId,
      childSlice as Record<string, unknown>,
      'overwrite',
    );
    applied++;
  }
  return applied;
}
