import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { syncExplicitParentStudentLink, resolveStudentRowId } from '@/lib/parents/links';

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
    const { error: rejectErr } = await sb.from('form_leads')
      .update({ match_status: 'new_prospect', match_candidate_id: null } as any)
      .eq('id', leadId);
    if (rejectErr) return NextResponse.json({ error: rejectErr.message }, { status: 500 });
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

  // If we matched the student but still haven't found a parent portal account,
  // check if the student candidate is already linked to a parent, or has a parent email.
  if (!matchedParentId && candidateId) {
    // 1. Try to find parent via parent_student_links for this student candidate
    const { data: parentLink } = await sb
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', candidateId)
      .maybeSingle();

    if (parentLink) {
      matchedParentId = parentLink.parent_id;
    } else {
      // 2. Try to find parent via parent_email on the student's own record
      const { data: student } = await sb
        .from('students')
        .select('parent_email')
        .eq('id', candidateId)
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

  // candidateId is a portal_users.id; the link junction + students table are
  // keyed on students.id, so resolve the real student row before linking/updating.
  const candidateStudentRowId = await resolveStudentRowId(sb as any, candidateId);

  // Sync the parent-student link if we resolved a parent and matched a student
  if (matchedParentId && candidateStudentRowId) {
    await syncExplicitParentStudentLink(sb as any, matchedParentId, candidateStudentRowId);
  }

  // Link the lead and mark as contacted
  const { error: approveErr } = await sb.from('form_leads').update({
    match_status:       'approved',
    status:             'contacted',
    matched_student_id: candidateId,
    matched_parent_id:  matchedParentId,
  } as any).eq('id', leadId);

  if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });

  // Consent form is source of truth for name, gender, and class (parent knows
  // the correct current class — e.g. Basic 5 when system shows Basic 1).
  const childName   = (rd.child_name   as string | undefined)?.trim() || null;
  const childClass  = (rd.child_class  as string | undefined)?.trim() || null;
  const childGender = (rd.child_gender as string | undefined)?.trim() || null;

  const studentOverride: Record<string, unknown> = {};
  if (childName)   studentOverride.full_name     = childName;
  if (childClass)  studentOverride.section_class = childClass;
  if (childGender) studentOverride.gender        = childGender;

  if (Object.keys(studentOverride).length > 0) {
    // portal_users + auth are keyed on the portal id (candidateId); the students
    // row is keyed on its own PK (candidateStudentRowId), resolved above.
    await (sb as any).from('portal_users').update(studentOverride).eq('id', candidateId);
    if (candidateStudentRowId) {
      await (sb as any).from('students').update({ ...studentOverride, updated_at: now }).eq('id', candidateStudentRowId);
    }
    // Keep Supabase auth metadata in sync
    await sb.auth.admin.updateUserById(candidateId, { user_metadata: studentOverride });
  }

  // Advance CRM pipeline + log interaction
  const contactId = (lead as any).contact_id as string | null;
  const resolvedContactId = contactId || (parentEmail
    ? ((await sb.from('customer_contact_book').select('id').eq('email', parentEmail).maybeSingle()).data as any)?.id ?? null
    : null);

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
