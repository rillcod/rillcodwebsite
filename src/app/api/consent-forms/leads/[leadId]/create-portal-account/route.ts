import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import {
  isParentLinkConflict,
  getExistingParentLink,
  resolveOrCreateStudentRowId,
  resolveStudentRowId,
  syncExplicitParentStudentLink,
  unlinkExplicitParentStudentLink,
} from '@/lib/parents/links';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { onboardLeadChildren } from '@/lib/consent/onboard-lead-children';
import {
  clearLeadChildLinks,
  collectLeadStudentPortalIds,
  listLeadChildLinks,
  upsertLeadChildLink,
} from '@/lib/consent/lead-child-links';
import { generateTempPassword } from '@/lib/utils/password';
import { logAudit } from '@/lib/audit/log';
import {
  applyConsentSpellingToLinkedStudents,
  prepareLeadForStudentOnboard,
} from '@/lib/consent/resolve-consent-lead-match';
import { attachConsentParentToLead } from '@/lib/consent/attach-parent';
import { linkParentSiblings, type SiblingLinkResult } from '@/lib/parents/sibling-links';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import {
  deliverConsentNewStudentCredentials,
  deliverConsentPortalCreationCredentials,
} from '@/lib/credentials/consent-portal-credentials';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/leads/[leadId]/create-portal-account
// Creates a parent portal account from a form lead, sends credentials via WhatsApp/email.
export async function POST(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  // Optional staff choices: place the new student(s) in a specific class (existing
  // id) or a class name to find-or-create for the school.
  const reqBody = await req.json().catch(() => ({} as Record<string, unknown>));
  const overrideClassId = (reqBody.classId as string) || null;
  const overrideClassName = (reqBody.className as string) || null;
  const targetChildIndex = typeof reqBody.child_index === 'number' ? reqBody.child_index : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id, full_name').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const staffName = (profile as unknown as { full_name: string | null }).full_name ?? 'Staff';

  const sb = adminClient();

  // Fetch lead
  let { data: lead, error: leadErr } = await (sb as any)
    .from('form_leads')
    .select('id, form_id, school_id, matched_school_id, email, response_data, matched_student_id, matched_parent_id, match_status, match_candidate_id')
    .eq('id', leadId)
    .single();

  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // The class the FORM was created for — used to place new students unless staff
  // explicitly chose a different class on this action.
  let formClassId: string | null = null;
  if (lead.form_id) {
    const { data: formRow } = await (sb as any).from('consent_forms').select('class_id').eq('id', lead.form_id).maybeSingle();
    formClassId = (formRow?.class_id as string) ?? null;
  }
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rd = (lead.response_data ?? {}) as Record<string, unknown>;
  const str = (k: string) => ((rd[k] as string) ?? '').trim();
  const parentEmail  = (str('parent_email') || (lead.email as string ?? '')).trim().toLowerCase();
  const parentName   = str('parent_name') || 'Parent/Guardian';
  const parentPhone  = str('parent_whatsapp') || str('parent_phone');
  const childName    = str('child_name');
  const childClass   = str('child_class') || null;
  const childGender  = str('child_gender') || null;

  const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
  const childMatches = (await listLeadChildLinks(sb as any, leadId))
    .filter((link) => ['approved', 'onboarded'].includes(link.link_status))
    .map((link) => ({
      childIndex: link.child_index,
      studentId: link.student_portal_user_id,
      studentName: link.student_name,
      studentClass: link.student_class,
      confidence: link.link_status,
    }));

  if (!parentEmail || !parentEmail.includes('@')) {
    return NextResponse.json({ error: 'No valid email address on this lead' }, { status: 400 });
  }

  // Parents must belong to a school — form school, else matched school.
  const parentSchoolId = (lead.school_id ?? lead.matched_school_id) as string | null;
  if (!parentSchoolId) {
    return NextResponse.json({
      error: 'This lead has no school. Assign the form/lead to a school before creating the parent portal.',
    }, { status: 400 });
  }

  // School name for warm, school-branded "welcome home" messaging — these are
  // existing families from a partner school being brought onto the platform.
  let schoolLabel = 'Rillcod Technologies';
  {
    const { data: sch } = await (sb as any).from('schools').select('name').eq('id', parentSchoolId).maybeSingle();
    if (sch?.name) schoolLabel = sch.name;
  }

  // Onboard children with NO existing student match into real student accounts
  // (shared with the bulk flow) and link them to the parent.
  const onboardUnmatchedChildren = async (parentId: string) => {
    const prepared = await prepareLeadForStudentOnboard(sb as any, leadId, user.id);
    if (!prepared.ok) {
      throw Object.assign(new Error(prepared.message), { code: prepared.code, status: 409 });
    }
    lead = prepared.lead;
    return onboardLeadChildren(sb as any, {
      lead, parentId, parentEmail, parentName, parentPhone: parentPhone || null,
      approvedBy: user.id,
      classId: overrideClassId || formClassId,
      className: overrideClassName,
      targetChildIndex,
    });
  };

  // Canonical provenance: each onboarded child gets one relational slot.
  const linkChildrenToLead = async (kids: Array<{ name: string; studentPortalId: string; childIndex?: number }>) => {
    for (const kid of kids) {
      if (!kid.studentPortalId) continue;
      await upsertLeadChildLink(sb as any, {
        lead_id: leadId,
        child_index: kid.childIndex ?? 0,
        student_portal_user_id: kid.studentPortalId,
        student_name: kid.name || null,
        student_class: null,
        link_status: 'onboarded',
        source: 'onboarded',
        linked_by: user.id,
      });
    }
    if (kids.length > 0) {
      await (sb as any).from('form_leads').update({ match_status: 'approved' }).eq('id', leadId);
    }
  };

  // Preflight every already-matched child before creating or mutating a parent
  // account. This avoids partial account creation when a child belongs elsewhere.
  const { data: existing } = await (sb as any)
    .from('portal_users')
    .select('id, email, full_name, role')
    .eq('email', parentEmail)
    .maybeSingle();

  if (existing && existing.role !== 'parent') {
    return NextResponse.json({
      error: `This email is already registered as a ${existing.role} account. Use a different parent email.`,
      code: 'EMAIL_ROLE_CONFLICT',
    }, { status: 409 });
  }

  const matchedPortalIds = [...new Set([
    lead.matched_student_id,
    ...childMatches.map((match) => match.studentId),
  ].filter(Boolean))] as string[];
  for (const portalId of matchedPortalIds) {
    const rowId = await resolveStudentRowId(sb as any, portalId);
    if (!rowId) continue;
    const currentLink = await getExistingParentLink(sb as any, rowId);
    if (currentLink && currentLink.parentId !== existing?.id) {
      return NextResponse.json({
        error: 'This student is already linked to another parent. Unlink the current parent before creating or linking this portal.',
        code: 'STUDENT_ALREADY_LINKED',
      }, { status: 409 });
    }
  }

  const attached = await attachConsentParentToLead(sb as any, {
    leadId,
    parentEmail,
    parentName,
    parentPhone: parentPhone || null,
    parentSchoolId,
    parentSchoolName: schoolLabel !== 'Rillcod Technologies' ? schoolLabel : null,
    matchedStudentId: lead.matched_student_id,
    childMatches: childMatches.map((m) => ({ childIndex: m.childIndex, studentId: m.studentId })),
    formClassId: formClassId || null,
    archiveCredentials: false,
    actorId: user.id,
  });
  if (!attached.ok || !attached.parentId) {
    return NextResponse.json(
      { error: attached.error || 'Failed to create or resolve parent account', code: attached.status === 409 ? 'EMAIL_ROLE_CONFLICT' : undefined },
      { status: attached.status || 500 },
    );
  }

  const parentId = attached.parentId;
  const alreadyExisted = !attached.created;
  const tempPassword = attached.password || null;

  // Family members pulled in from the roster beyond the child named on the lead.
  const siblingsLinked = (attached.siblings?.linked ?? []).map((s) => s.fullName ?? 'Student');
  const siblingsNeedingReview = [
    ...(attached.siblings?.skipped ?? []).map((s) => ({ id: s.portalUserId, name: s.fullName, reason: s.reason, matchedToken: s.matchedToken ?? null })),
    ...(attached.siblings?.suggested ?? []).map((s) => ({ id: s.portalUserId, name: s.fullName, reason: s.reason, matchedToken: s.matchedToken ?? null })),
  ];

  // Onboard any brand-new children into real student accounts + link to this parent.
  let newStudents;
  try {
    newStudents = await onboardUnmatchedChildren(parentId);
  } catch (error) {
    if (isParentLinkConflict(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if ((error as { status?: number; code?: string })?.status === 409) {
      const e = error as Error & { code?: string };
      return NextResponse.json({ error: e.message, code: e.code ?? 'CONSENT_MATCH_PENDING' }, { status: 409 });
    }
    throw error;
  }

  await applyConsentSpellingToLinkedStudents(sb as any, leadId);
  await linkChildrenToLead(newStudents);

  if (alreadyExisted) {
    if (newStudents.length > 0) {
      try {
        await deliverConsentNewStudentCredentials(sb as any, {
          parentId,
          parentEmail,
          parentName,
          parentPhone: parentPhone || null,
          newStudents,
          schoolId: lead.school_id ?? null,
          schoolName: schoolLabel !== 'Rillcod Technologies' ? schoolLabel : null,
        });
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({
      success: true, alreadyExisted: true, parentId,
      email: parentEmail,
      newStudents: newStudents.map((s: { name: string; email: string; password: string }) => ({ name: s.name, email: s.email, password: s.password })),
      studentsOnboarded: newStudents.length,
      siblingsLinked,
      siblingsNeedingReview,
    });
  }

  const creationDelivery = await deliverConsentPortalCreationCredentials(sb as any, {
    parentId,
    parentEmail,
    parentName,
    parentPhone: parentPhone || null,
    parentPassword: tempPassword || generateTempPassword(),
    newStudents,
    schoolId: lead.school_id ?? null,
    schoolName: schoolLabel !== 'Rillcod Technologies' ? schoolLabel : null,
    bodyIntro: `Dear ${parentName}, welcome to ${schoolLabel} on Rillcod! Your accounts are set up and ready${childName ? ` for ${childName}` : ''}.`,
  });
  const channelsSent = creationDelivery.channels;

  await (sb as any).from('form_leads').update({
    matched_parent_id: parentId,
    response_data: {
      ...rd,
      portal_created_at:       new Date().toISOString(),
      portal_credentials_sent: channelsSent,
      portal_created_by:       staffName,
    },
  }).eq('id', leadId);

  await logAudit(sb as any, {
    action: 'consent_portal_created',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValue: `${staffName} created a parent portal account from consent lead — ${newStudents.length} student(s) onboarded${siblingsLinked.length ? `, ${siblingsLinked.length} sibling(s) linked from the roster` : ''} — credentials sent via ${channelsSent.join(', ') || 'none'}`,
    newValues: {
      parent_id: parentId,
      students_onboarded: newStudents.length,
      student_names: newStudents.map((s: { name: string }) => s.name),
      siblings_linked: siblingsLinked.length,
      sibling_names: siblingsLinked,
      channels_sent: channelsSent,
      actor_name: staffName,
      actor_role: profile.role,
    },
  });

  return NextResponse.json({
    success: true, alreadyExisted: false, parentId, tempPassword, email: parentEmail,
    newStudents: newStudents.map((s: { name: string; email: string; password: string }) => ({ name: s.name, email: s.email, password: s.password })),
    studentsOnboarded: newStudents.length,
    siblingsLinked,
    siblingsNeedingReview,
  });
}

// PATCH /api/consent-forms/leads/[leadId]/create-portal-account
// Manually links an existing student (by portal_users.id) to the lead's parent account.
export async function PATCH(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { student_portal_id, child_index } = await req.json();
  if (!student_portal_id) return NextResponse.json({ error: 'student_portal_id is required' }, { status: 400 });

  const sb = adminClient();

  const { data: lead } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, matched_parent_id, matched_student_id, response_data')
    .eq('id', leadId).single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead.matched_parent_id) return NextResponse.json({ error: 'No portal account on this lead yet' }, { status: 400 });

  const leadRd      = (lead.response_data ?? {}) as Record<string, unknown>;
  const childrenArr = Array.isArray(leadRd.children) ? (leadRd.children as Array<Record<string, string>>) : null;
  const effectiveIdx = typeof child_index === 'number' ? child_index : 0;
  const leadGender  = (childrenArr?.[effectiveIdx]?.gender ?? (leadRd.child_gender as string)) || null;

  // Resolve student portal user → students table row. Auto-provision a minimal
  // students row when none exists (portal-only students, e.g. summer/online),
  // so manual linking never silently fails.
  const studentRowId = await resolveOrCreateStudentRowId(sb as any, student_portal_id);
  if (!studentRowId) return NextResponse.json({ error: 'Could not resolve or create a student record for this account' }, { status: 404 });
  const studentRow = { id: studentRowId };

  // Get parent email/name for denormalisation
  const { data: parent } = await (sb as any)
    .from('portal_users').select('email, full_name, phone').eq('id', lead.matched_parent_id).single();

  // Create explicit link
  try {
    await syncExplicitParentStudentLink(sb as any, lead.matched_parent_id, studentRow.id);
  } catch (e: any) {
    if (isParentLinkConflict(e)) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    return NextResponse.json({ error: `Failed to create parent-student link: ${e.message}` }, { status: 500 });
  }

  // Update students row so parent shows in school-scoped lists
  if (parent) {
    const { error: stuErr } = await (sb as any).from('students').update({
      parent_email: parent.email,
      parent_name:  parent.full_name,
      parent_phone: parent.phone ?? null,
      ...(leadGender ? { gender: leadGender } : {}),
      updated_at:   new Date().toISOString(),
    }).eq('id', studentRow.id);
    if (stuErr) console.error('[link-child] students update error:', stuErr.message);
  }

  const childData = childrenArr?.[effectiveIdx];
  try {
    await upsertLeadChildLink(sb as any, {
      lead_id: leadId,
      child_index: effectiveIdx,
      student_portal_user_id: student_portal_id,
      student_name: childData?.name ?? null,
      student_class: childData?.class ?? null,
      link_status: 'approved',
      source: 'staff_link',
      linked_by: user.id,
    });
  } catch (leadErr: any) {
    return NextResponse.json({ error: `Linked student but failed to update lead record: ${leadErr.message}` }, { status: 500 });
  }

  await applyConsentSpellingToLinkedStudents(sb as any, leadId);

  // Linking one child by hand is the moment we know this parent owns children on
  // this roster — pull in any remaining siblings rather than making staff repeat
  // the action once per child.
  let siblings: SiblingLinkResult | undefined;
  try {
    siblings = await linkParentSiblings(sb as any, {
      parentId: lead.matched_parent_id,
      schoolId: lead.school_id ?? null,
      excludeStudentRowIds: [studentRow.id],
      actorId: user.id,
      source: 'consent.staffLink.siblings',
    });
  } catch (e) {
    console.error('[link-child] sibling reconciliation failed (non-fatal):', e);
  }
  const siblingsLinked = (siblings?.linked ?? []).map((s) => s.fullName ?? 'Student');

  await logAudit(sb as any, {
    action: 'consent_child_linked',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValue: `Staff linked an existing student to consent lead (parent account) — student portal ID: ${student_portal_id}${siblingsLinked.length ? ` — ${siblingsLinked.length} sibling(s) linked automatically` : ''}`,
    newValues: {
      parent_id: lead.matched_parent_id,
      student_portal_id,
      child_index: effectiveIdx,
      siblings_linked: siblingsLinked.length,
      sibling_names: siblingsLinked,
    },
  });

  return NextResponse.json({
    success: true,
    student_id: studentRow.id,
    student_portal_id,
    child_index: effectiveIdx,
    siblingsLinked,
    siblingsNeedingReview: [
      ...(siblings?.skipped ?? []).map((s) => ({ id: s.portalUserId, name: s.fullName, reason: s.reason, matchedToken: s.matchedToken ?? null })),
      ...(siblings?.suggested ?? []).map((s) => ({ id: s.portalUserId, name: s.fullName, reason: s.reason, matchedToken: s.matchedToken ?? null })),
    ],
  });
}

// DELETE /api/consent-forms/leads/[leadId]/create-portal-account
// Hard-deletes the portal account created from this lead (auth user + portal_users + links).
export async function DELETE(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();

  const { data: lead } = await (sb as any)
    .from('form_leads')
    .select('id, school_id, matched_parent_id, matched_student_id, response_data')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!lead.matched_parent_id) {
    return NextResponse.json({ error: 'No portal account linked to this lead' }, { status: 400 });
  }

  const parentId = lead.matched_parent_id;
  const leadResponse = (lead.response_data ?? {}) as Record<string, any>;
  const parentCreatedByThisLead = Boolean(leadResponse.portal_created_at);

  if (!parentCreatedByThisLead) {
    // This lead reused a pre-existing parent account. Removing the lead's portal
    // association must never delete that account or links belonging to siblings.
    const childPortalIds = await collectLeadStudentPortalIds(sb as any, leadId);
    const childRowIds: string[] = [];
    for (const portalId of childPortalIds) {
      const rowId = await resolveStudentRowId(sb as any, portalId);
      if (rowId) childRowIds.push(rowId);
    }
    if (childRowIds.length > 0) {
      for (const rowId of childRowIds) {
        await unlinkExplicitParentStudentLink(sb as any, parentId, rowId);
      }
    }
    await clearLeadChildLinks(sb as any, leadId);
    await (sb as any).from('form_leads').update({
      matched_parent_id: null,
      match_status: 'new_prospect',
    }).eq('id', leadId);
    await logAudit(sb as any, {
      action: 'consent_portal_unlinked',
      actorId: user.id,
      resourceType: 'form_lead',
      resourceId: leadId,
      newValue: `Staff unlinked an existing parent account from consent lead (account NOT deleted — was pre-existing) — parent ID: ${parentId}`,
      oldValues: { parent_id: parentId },
    });
    return NextResponse.json({ success: true, parentDeleted: false });
  }

  // Fetch parent email before deletion so we can wipe student denorm fields
  const { data: parentRow } = await (sb as any)
    .from('portal_users').select('email').eq('id', parentId).maybeSingle();

  // Fetch all parent-student links to safely clean up parent denormalized metadata in students table
  const { data: linkedStudents } = await (sb as any)
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', parentId);
  const studentIdsToClear = (linkedStudents ?? []).map((row: any) => row.student_id).filter(Boolean);
  if (lead.matched_student_id) {
    const primaryStudentRowId = await resolveStudentRowId(sb as any, lead.matched_student_id);
    if (primaryStudentRowId) studentIdsToClear.push(primaryStudentRowId);
  }

  // Remove explicit parent-child links through the shared lifecycle helper.
  for (const studentId of [...new Set(studentIdsToClear)] as string[]) {
    await unlinkExplicitParentStudentLink(sb as any, parentId, studentId);
  }

  // Clear parent fields from ALL explicitly linked students
  const uniqueStudentIds = [...new Set(studentIdsToClear)];
  if (uniqueStudentIds.length > 0) {
    await (sb as any).from('students').update({
      parent_email: null, parent_name: null, parent_phone: null,
      updated_at: new Date().toISOString(),
    }).in('id', uniqueStudentIds);
  }

  // Also clear parent fields by email as safety fallback
  if (parentRow?.email) {
    await (sb as any).from('students').update({
      parent_email: null, parent_name: null, parent_phone: null,
      updated_at: new Date().toISOString(),
    }).eq('parent_email', parentRow.email);
  }

  // Delete portal_users row
  await (sb as any).from('portal_users').delete().eq('id', parentId);

  // Hard-delete the Supabase auth user
  await sb.auth.admin.deleteUser(parentId);

  // Clear lead references so it no longer shows as linked
  await clearLeadChildLinks(sb as any, leadId);
  await (sb as any).from('form_leads').update({
    matched_parent_id: null,
    match_status: 'new_prospect',
  }).eq('id', leadId);

  await logAudit(sb as any, {
    action: 'consent_portal_removed',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValue: `Staff permanently deleted parent portal account and auth user from consent lead — parent ID: ${parentId}`,
    oldValues: { parent_id: parentId },
    newValues: { parent_deleted: true, students_cleared: studentIdsToClear.length },
  });

  return NextResponse.json({ success: true });
}

// PUT /api/consent-forms/leads/[leadId]/create-portal-account
// Resend login credentials: regenerates the parent's (and each linked student's) password
// and delivers them by WhatsApp + email. Used by the "Resend credentials" button so staff
// can hand out logins on demand after silent account creation.
export async function PUT(_req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();
  const { data: lead } = await (sb as any)
    .from('form_leads').select('id, school_id, matched_parent_id, matched_student_id, response_data').eq('id', leadId).maybeSingle();
  if (!lead?.matched_parent_id) return NextResponse.json({ error: 'No portal account on this lead yet.' }, { status: 400 });

  const { data: parent } = await (sb as any)
    .from('portal_users').select('email, full_name, phone').eq('id', lead.matched_parent_id).single();
  if (!parent?.email) return NextResponse.json({ error: 'Parent account has no email on file.' }, { status: 400 });

  const studentPortalIds = await collectLeadStudentPortalIds(sb as any, leadId);
  const studentTargets: Array<{ userId: string; email: string; displayName: string; role: 'student' }> = [];
  for (const sid of studentPortalIds) {
    const { data: s } = await (sb as any)
      .from('portal_users')
      .select('email, full_name')
      .eq('id', sid)
      .eq('role', 'student')
      .maybeSingle();
    if (!s?.email) continue;
    studentTargets.push({
      userId: sid,
      email: s.email,
      displayName: s.full_name || 'Student',
      role: 'student',
    });
  }

  let schoolName: string | null = null;
  if (lead.school_id) {
    const { data: sch } = await (sb as any).from('schools').select('name').eq('id', lead.school_id).maybeSingle();
    schoolName = sch?.name ?? null;
  }

  const delivery = await deliverPortalCredentials(sb as any, {
    parent: {
      userId: lead.matched_parent_id as string,
      email: parent.email,
      displayName: parent.full_name || 'Parent',
      role: 'parent',
    },
    students: studentTargets,
    parentPhone: parent.phone ?? null,
    parentName: parent.full_name || 'Parent',
    schoolName,
    schoolId: lead.school_id ?? null,
    resetPolicy: 'always',
    archiveToRegistrationResults: true,
    emailChannel: 'system',
    title: 'Your Rillcod Login Details',
    emailSubject: 'Your Rillcod Login Details',
  });

  await logAudit(sb as any, {
    action: 'consent_credentials_resent',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValue: `Staff resent login credentials for parent ${parent.full_name ?? parent.email} and ${delivery.students.length} student(s) via ${delivery.channels.join(', ') || 'none'}`,
    newValues: {
      channels: delivery.channels,
      students_sent: delivery.students.length,
      actor_role: profile.role,
    },
  });
  return NextResponse.json({
    success: true,
    channels: delivery.channels,
    studentsSent: delivery.students.length,
    email: parent.email,
    tempPassword: delivery.parent.password,
    parentName: parent.full_name || 'Parent',
    students: delivery.students.map((s) => ({
      name: s.name,
      email: s.email,
      password: s.password ?? '',
    })),
  });
}
