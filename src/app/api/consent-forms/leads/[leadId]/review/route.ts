import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { reconcileWithCRM } from '@/lib/consent-forms/reconcile-crm';

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
    .select('id, school_id, form_id, match_candidate_id, match_status, response_data, email, contact_id, child_current_school, matched_school_id')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (profile.role !== 'admin' && lead.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (lead.match_status !== 'pending_review') {
    return NextResponse.json({ error: 'Lead is not pending review' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rd  = (lead.response_data as Record<string, string>) ?? {};

  if (action === 'reject') {
    // Treat as a brand-new prospect — no student link
    await sb.from('form_leads')
      .update({ match_status: 'new_prospect', match_candidate_id: null, updated_at: now } as any)
      .eq('id', leadId);
    return NextResponse.json({ success: true, status: 'new_prospect' });
  }

  // ── APPROVE ──────────────────────────────────────────────────────────────

  const candidateId = lead.match_candidate_id;
  if (!candidateId) return NextResponse.json({ error: 'No candidate to approve' }, { status: 400 });

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

  // ── Ensure CRM contact exists (created here on first staff action) ──────────
  let resolvedContactId = (lead as any).contact_id as string | null;
  if (!resolvedContactId) {
    // Try to find existing contact
    if (parentEmail) {
      const { data: existing } = await sb.from('customer_contact_book').select('id').eq('email', parentEmail).maybeSingle();
      resolvedContactId = (existing as any)?.id ?? null;
    }
    if (!resolvedContactId && parentPhone) {
      const { data: existing } = await sb.from('customer_contact_book').select('id').ilike('phone', `%${parentPhone.slice(-9)}%`).maybeSingle();
      resolvedContactId = (existing as any)?.id ?? null;
    }
    // If still no contact, create one via full CRM reconciliation
    if (!resolvedContactId) {
      const formRow = await (sb as any).from('consent_forms').select('title, school_id, schools(name)').eq('id', (lead as any).form_id).maybeSingle();
      const formData = formRow.data;
      const schoolName = (formData?.schools as any)?.name ?? 'Rillcod Technologies';
      try {
        const { contactId: newContactId, prospectId: newProspectId } = await reconcileWithCRM({
          parentName:      rd.parent_name || 'Parent/Guardian',
          parentEmail:     parentEmail,
          parentWhatsapp:  rd.parent_whatsapp || '',
          childName:       rd.child_name || '',
          childAge:        rd.child_age || '',
          childClass:      rd.child_class || '',
          programCategory: rd.program_category || '',
          currentSchool:   (lead as any).child_current_school ?? null,
          matchedSchoolId: (lead as any).matched_school_id ?? null,
          schoolId:        (lead as any).school_id ?? null,
          schoolName,
          formId:          leadId,
          formTitle:       formData?.title ?? '',
        });
        resolvedContactId = newContactId;
        if (newContactId || newProspectId) {
          await sb.from('form_leads').update({ contact_id: newContactId, prospect_id: newProspectId } as any).eq('id', leadId);
        }
      } catch { /* non-fatal */ }
    } else {
      await sb.from('form_leads').update({ contact_id: resolvedContactId } as any).eq('id', leadId);
    }
  }

  // Link the lead and mark as contacted
  await sb.from('form_leads').update({
    match_status:       'approved',
    status:             'contacted',
    matched_student_id: candidateId,
    matched_parent_id:  matchedParentId,
    updated_at:         now,
  } as any).eq('id', leadId);

  if (resolvedContactId) {
    try {
      const stageOrder = ['lead', 'enquiry', 'contacted', 'trial', 'enrolled'];
      const { data: pipe } = await (sb as any).from('crm_pipeline').select('id, stage').eq('contact_id', resolvedContactId).maybeSingle();
      if (pipe) {
        if (stageOrder.indexOf(pipe.stage) < stageOrder.indexOf('contacted')) {
          await (sb as any).from('crm_pipeline').update({ stage: 'contacted', updated_at: now }).eq('contact_id', resolvedContactId);
        }
      } else {
        await (sb as any).from('crm_pipeline').insert({
          contact_id: resolvedContactId, contact_name: rd.parent_name || 'Parent/Guardian',
          contact_type: 'form_lead', stage: 'contacted', created_at: now, updated_at: now,
        });
      }
      await sb.from('crm_interactions').insert({
        contact_id:   resolvedContactId,
        contact_name: rd.parent_name || 'Parent/Guardian',
        contact_type: 'form_lead',
        type:         'match_approved',
        direction:    'internal',
        content:      `Staff matched form lead to existing student (approved by ${profile.full_name ?? profile.role}). Student ID: ${candidateId}.`,
        created_at:   now,
      } as any);
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    success: true,
    status: 'approved',
    matched_student_id: candidateId,
    matched_parent_id:  matchedParentId,
  });
}
