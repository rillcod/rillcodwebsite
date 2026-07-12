import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import {
  isParentLinkConflict,
  resolveStudentRowId,
  syncExplicitParentStudentLink,
} from '@/lib/parents/links';
import { canAccessSchool } from '@/lib/auth/school-scope';
import {
  harmonizeStudentParentIdentity,
  syncParentContactAcrossStores,
  syncStudentFromLeadResponse,
} from '@/lib/sync/student-parent-identity';
import { logAudit } from '@/lib/audit/log';
import {
  clearLeadChildLinks,
  listLeadChildLinks,
  removeLeadChildLink,
  upsertLeadChildLink,
} from '@/lib/consent/lead-child-links';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// PATCH /api/consent-forms/leads/[leadId]/review
// Body: { action: 'approve' | 'reject' }
//   approve → links match_candidate_id as matched_student_id, resolves parent
//   reject  → marks as new_prospect (keeps CRM records, drops candidate link)
export async function PATCH(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id, full_name').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action } = await req.json();
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  }

  const sb = adminClient();

  // Fetch the lead with its candidate
  const { data: lead } = await sb
    .from('form_leads')
    .select('id, school_id, match_candidate_id, match_status, response_data, email, contact_id')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (lead.match_status !== 'pending_review') {
    return NextResponse.json({ error: 'Lead is not pending review' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rd  = (lead.response_data as Record<string, string>) ?? {};

  if (action === 'reject') {
    // Treat as a brand-new prospect — no student link
    const { error: rejectErr } = await sb.from('form_leads')
      .update({ match_status: 'new_prospect', match_candidate_id: null } as any)
      .eq('id', leadId);
    if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500 });
    // Clear relational candidate suggestions so portal/create cannot link them later.
    try {
      const existingLinks = await listLeadChildLinks(sb as any, leadId);
      const hasOnlyCandidates = existingLinks.length > 0
        && existingLinks.every((link) => link.link_status === 'candidate');
      if (hasOnlyCandidates) {
        await clearLeadChildLinks(sb as any, leadId);
      } else {
        for (const link of existingLinks.filter((row) => row.link_status === 'candidate')) {
          await removeLeadChildLink(sb as any, leadId, link.child_index);
        }
      }
    } catch { /* non-fatal */ }
    await logAudit(sb as any, {
      action: 'consent_match_rejected',
      actorId: user.id,
      resourceType: 'form_lead',
      resourceId: leadId,
      oldValues: { candidate_id: lead.match_candidate_id },
    });
    return NextResponse.json({ success: true, status: 'new_prospect' });
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────

  const candidateId = lead.match_candidate_id;
  if (!candidateId) return NextResponse.json({ error: 'No candidate to approve' }, { status: 400 });
  // match_candidate_id is portal_users.id; every students/junction query below
  // must use the operational students.id instead.
  const candidateStudentRowId = await resolveStudentRowId(sb as any, candidateId);
  if (!candidateStudentRowId) {
    return NextResponse.json({ error: 'The matched portal account has no student record.' }, { status: 409 });
  }

  // Find existing parent portal_users by email or phone
  const parentEmail = rd.parent_email || (lead.email as string) || '';
  const parentPhone = rd.parent_whatsapp?.replace(/\D/g, '') || '';

  let matchedParentId: string | null = null;
  if (parentEmail) {
    const { data } = await sb.from('portal_users').select('id').eq('email', parentEmail).eq('role', 'parent').maybeSingle();
    matchedParentId = (data as any)?.id ?? null;
  }
  if (!matchedParentId && parentPhone) {
    const { data } = await sb.from('portal_users').select('id').eq('role', 'parent')
      .ilike('phone', `%${parentPhone.slice(-9)}%`).maybeSingle();
    matchedParentId = (data as any)?.id ?? null;
  }

  // If we matched the student but still haven't found a parent portal account,
  // check if the student candidate is already linked to a parent, or has a parent email.
  if (!matchedParentId && candidateId) {
    // 1. Try to find parent via parent_student_links for this student candidate
    const { data: parentLink } = await sb
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', candidateStudentRowId)
      .maybeSingle();

    if (parentLink) {
      const { data: linkedParent } = await sb
        .from('portal_users')
        .select('id, email, phone')
        .eq('id', parentLink.parent_id)
        .maybeSingle();
      const linkedEmail = String(linkedParent?.email ?? '').trim().toLowerCase();
      const linkedPhone = String(linkedParent?.phone ?? '').replace(/\D/g, '');
      const submittedEmail = parentEmail.trim().toLowerCase();
      const submittedPhone = parentPhone.replace(/\D/g, '');
      const sameParent =
        (!!submittedEmail && linkedEmail === submittedEmail)
        || (!!submittedPhone && !!linkedPhone && linkedPhone.endsWith(submittedPhone.slice(-9)));
      if (!sameParent) {
        return NextResponse.json({
          error: 'This student is already linked to another parent. Unlink the current parent before approving this match.',
          code: 'STUDENT_ALREADY_LINKED',
        }, { status: 409 });
      }
      matchedParentId = parentLink.parent_id;
    } else {
      // 2. Try to find parent via parent_email on the student's own record
      const { data: student } = await sb
        .from('students')
        .select('parent_email')
        .eq('id', candidateStudentRowId)
        .maybeSingle();

      if (student?.parent_email) {
        const { data: parentByEmail } = await sb
          .from('portal_users')
          .select('id')
          .eq('email', student.parent_email)
          .eq('role', 'parent')
          .maybeSingle();

        if (parentByEmail) {
          matchedParentId = parentByEmail.id;
        }
      }
    }
  }

  // Sync the parent-student link if we resolved a parent and matched a student
  if (matchedParentId && candidateStudentRowId) {
    try {
      await syncExplicitParentStudentLink(sb as any, matchedParentId, candidateStudentRowId);
    } catch (error) {
      if (isParentLinkConflict(error)) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
      }
      throw error;
    }
  }

  await upsertLeadChildLink(sb as any, {
    lead_id: leadId,
    child_index: 0,
    student_portal_user_id: candidateId,
    student_name: String(rd.child_name ?? '').trim() || null,
    student_class: String(rd.child_class ?? '').trim() || null,
    link_status: 'approved',
    source: 'match_review',
    linked_by: user.id,
  });

  // The child-link trigger maintains matched_student_id as a derived cache.
  const { error: approveErr } = await sb.from('form_leads').update({
    match_status:       'approved',
    status:             'contacted',
    matched_parent_id:  matchedParentId,
  } as any).eq('id', leadId);

  if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });
  await logAudit(sb as any, {
    action: 'consent_match_approved',
    actorId: user.id,
    resourceType: 'form_lead',
    resourceId: leadId,
    newValues: { student_portal_id: candidateId, parent_id: matchedParentId },
  });

  // Consent form is source of truth for name, gender, age, and class.
  await syncStudentFromLeadResponse(sb as any, candidateId, rd as Record<string, unknown>, 'overwrite');
  if (matchedParentId) {
    await syncParentContactAcrossStores(sb as any, matchedParentId, {
      full_name: String(rd.parent_name ?? '').trim() || undefined,
      email: parentEmail ?? undefined,
      phone: String(rd.parent_whatsapp ?? '').trim() || undefined,
    });
  }
  await harmonizeStudentParentIdentity(sb as any, {
    studentUserId: candidateId,
    parentId: matchedParentId,
    parentPhone: String(rd.parent_whatsapp ?? '').trim() || null,
  });

  // Advance CRM pipeline + log interaction
  const contactId = (lead as any).contact_id as string | null;
  const resolvedContactId = contactId || (parentEmail
    ? ((await sb.from('customer_contact_book').select('id').eq('email', parentEmail).maybeSingle()).data as any)?.id ?? null
    : null);

  if (resolvedContactId) {
    try {
      const { upsertCrmPipeline, insertCrmInteraction } = await import('@/lib/crm/pipeline');
      const parentName = rd.parent_name || 'Parent/Guardian';
      await upsertCrmPipeline(sb as any, {
        contactId: resolvedContactId,
        contactName: parentName,
        contactType: 'form_lead',
        stage: 'active',
        promoteOnly: true,
      });
      await insertCrmInteraction(sb as any, {
        contactId: resolvedContactId,
        contactName: parentName,
        contactType: 'form_lead',
        type: 'match_approved',
        direction: 'internal',
        content: `Staff matched form lead to existing student (approved by ${profile.full_name ?? profile.role}). Student ID: ${candidateId}.`,
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    success: true,
    status: 'approved',
    matched_student_id: candidateId,
    matched_parent_id:  matchedParentId,
  });
}
