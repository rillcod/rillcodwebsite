import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { canAccessSchool } from '@/lib/auth/school-scope';
import { logAudit } from '@/lib/audit/log';
import {
  clearLeadChildLinks,
  listLeadChildLinks,
  removeLeadChildLink,
} from '@/lib/consent/lead-child-links';
import { resolveConsentLeadMatch } from '@/lib/consent/resolve-consent-lead-match';

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

  const rd = (lead.response_data as Record<string, string>) ?? {};

  if (action === 'reject') {
    const { error: rejectErr } = await sb.from('form_leads')
      .update({ match_status: 'new_prospect', match_candidate_id: null } as any)
      .eq('id', leadId);
    if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500 });
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

  const candidateId = lead.match_candidate_id;
  if (!candidateId) return NextResponse.json({ error: 'No candidate to approve' }, { status: 400 });

  const resolved = await resolveConsentLeadMatch(sb as any, {
    leadId,
    studentPortalUserId: candidateId,
    childIndex: 0,
    actorId: user.id,
    source: 'staff_approve',
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message, code: resolved.code }, { status: 409 });
  }

  const parentEmail = rd.parent_email || (lead.email as string) || '';
  const contactId = (lead as any).contact_id as string | null;
  const resolvedContactId = contactId || (parentEmail
    ? ((await sb.from('customer_contact_book').select('id').eq('email', parentEmail).maybeSingle()).data as any)?.id ?? null
    : null);

  if (resolvedContactId) {
    try {
      const { upsertCrmPipeline, insertCrmInteraction } = await import('@/lib/crm/pipeline');
      const { promoteBookLeadToPortalIfLinked } = await import('@/lib/crm/contact-book');
      const parentName = rd.parent_name || 'Parent/Guardian';
      const promo = await promoteBookLeadToPortalIfLinked(sb as any, {
        bookId: resolvedContactId,
        email: parentEmail,
        phone: String(rd.parent_whatsapp ?? '').trim() || null,
      });
      const crmContactId = promo.portalId || resolvedContactId;
      const contactType = promo.portalId ? 'parent' : 'form_lead';
      await upsertCrmPipeline(sb as any, {
        contactId: crmContactId,
        contactName: parentName,
        contactType,
        stage: 'active',
        promoteOnly: true,
      });
      await insertCrmInteraction(sb as any, {
        contactId: crmContactId,
        contactName: parentName,
        contactType,
        type: 'match_approved',
        direction: 'internal',
        content: `Staff matched form lead to existing student (approved by ${profile.full_name ?? profile.role}). Student ID: ${candidateId}.`,
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    success: true,
    status: 'approved',
    matched_student_id: resolved.studentPortalId,
    matched_parent_id: resolved.parentPortalId,
  });
}
