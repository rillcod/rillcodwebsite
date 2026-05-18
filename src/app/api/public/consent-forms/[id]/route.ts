import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { buildFormLeadConfirmationEmail, buildLeadNotificationEmail } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/public/consent-forms/[id]
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error } = await sb
    .from('consent_forms')
    .select('id, title, body, form_type, due_date, school_id, schools(name)')
    .eq('id', id)
    .eq('is_public', true)
    .single();

  if (error || !form) return NextResponse.json({ error: 'Form not found or not public' }, { status: 404 });
  return NextResponse.json({ data: form });
}

// ── CRM reconciliation ────────────────────────────────────────────────────────

interface ReconcileResult {
  contactId: string | null;
  prospectId: string | null;
}

async function reconcileWithCRM(
  sb: ReturnType<typeof adminClient>,
  params: {
    parentName: string;
    parentEmail: string;
    parentWhatsapp: string;
    childName: string;
    childAge: string;
    childClass: string;
    programCategory: string;
    currentSchool: string | null;
    matchedSchoolId: string | null;
    schoolId: string | null;
    schoolName: string;
    formId: string;
    formTitle: string;
    referralSource?: string;
    preferredSchedule?: string;
    hearAboutUs?: string;
  },
): Promise<ReconcileResult> {
  const {
    parentName, parentEmail, parentWhatsapp, childName, childAge, childClass,
    programCategory, currentSchool, matchedSchoolId, schoolId, schoolName,
    formId, formTitle, referralSource, preferredSchedule, hearAboutUs,
  } = params;

  const now = new Date().toISOString();
  const phone = parentWhatsapp?.replace(/\D/g, '') || null;
  const email = parentEmail?.trim() || null;

  const courseLabel =
    programCategory === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' :
    programCategory === 'teen_developers'  ? 'Teen Developers (SEC · Ages 11–19)' :
    programCategory || null;

  let contactId: string | null = null;
  let prospectId: string | null = null;

  // ── 1. Reconcile parent → customer_contact_book ─────────────────────────

  try {
    // Look up by email first, then phone
    let existingContact: { id: string; metadata: Record<string, unknown> } | null = null;

    if (email) {
      const { data } = await (sb as any)
        .from('customer_contact_book')
        .select('id, metadata')
        .eq('email', email)
        .maybeSingle();
      existingContact = data;
    }

    if (!existingContact && phone) {
      const { data } = await (sb as any)
        .from('customer_contact_book')
        .select('id, metadata')
        .eq('phone', phone)
        .maybeSingle();
      existingContact = data;
    }

    const childEntry = { name: childName, age: childAge, class: childClass, program: courseLabel, school: currentSchool };

    if (existingContact) {
      // Merge child into existing metadata.children array
      const existing = (existingContact.metadata as Record<string, unknown>) ?? {};
      const children = Array.isArray(existing.children) ? existing.children as Record<string, unknown>[] : [];
      const childIdx = children.findIndex((c: Record<string, unknown>) =>
        String(c.name ?? '').toLowerCase() === childName.toLowerCase());
      if (childIdx >= 0) {
        children[childIdx] = { ...children[childIdx], ...childEntry };
      } else {
        children.push(childEntry);
      }
      const formLeads = Array.isArray(existing.form_leads) ? existing.form_leads as string[] : [];
      if (!formLeads.includes(formId)) formLeads.push(formId);

      await (sb as any)
        .from('customer_contact_book')
        .update({
          full_name:    parentName,
          phone:        phone ?? undefined,
          email:        email ?? undefined,
          last_channel: 'consent_form',
          updated_at:   now,
          metadata: { ...existing, children, form_leads: formLeads, last_form_title: formTitle, last_form_id: formId },
        })
        .eq('id', existingContact.id);

      contactId = existingContact.id;
    } else {
      // Create new contact
      const { data: newContact } = await (sb as any)
        .from('customer_contact_book')
        .insert({
          full_name:    parentName,
          email,
          phone,
          role:         'parent',
          source:       'consent_form',
          last_channel: 'consent_form',
          school_name:  schoolName,
          metadata: {
            children: [childEntry],
            form_leads: [formId],
            last_form_title: formTitle,
            last_form_id: formId,
          },
          confirmed_at: now,
          created_at:   now,
          updated_at:   now,
        })
        .select('id')
        .single();
      contactId = newContact?.id ?? null;
    }
  } catch {
    // Non-fatal — CRM enrichment should never block the lead save
  }

  // ── 2. Reconcile child → prospective_students ────────────────────────────

  try {
    // Match on parent email + school — most reliable deduplication key
    let existingProspect: { id: string } | null = null;

    if (email) {
      const q = (sb as any)
        .from('prospective_students')
        .select('id')
        .eq('parent_email', email);
      const withSchool = schoolId ? q.eq('school_id', schoolId) : q;
      const { data } = await withSchool.maybeSingle();
      existingProspect = data;
    }

    const prospectPayload = {
      full_name:          childName,
      email:              email ?? `lead-${formId}@noemail.local`, // placeholder if no email
      age:                childAge ? parseInt(childAge, 10) : null,
      grade:              childClass || null,
      course_interest:    courseLabel,
      parent_name:        parentName,
      parent_email:       email,
      parent_phone:       phone,
      school_id:          matchedSchoolId ?? schoolId ?? null,
      school_name:        currentSchool ?? schoolName,
      hear_about_us:      hearAboutUs ?? referralSource ?? null,
      preferred_schedule: preferredSchedule ?? null,
      notes:              `From consent form: "${formTitle}"`,
      status:             'enquiry',
      updated_at:         now,
    };

    if (existingProspect) {
      await (sb as any)
        .from('prospective_students')
        .update(prospectPayload)
        .eq('id', existingProspect.id);
      prospectId = existingProspect.id;
    } else {
      const { data: newProspect } = await (sb as any)
        .from('prospective_students')
        .insert({ ...prospectPayload, created_at: now, is_active: true, is_deleted: false })
        .select('id')
        .single();
      prospectId = newProspect?.id ?? null;
    }
  } catch {
    // Non-fatal
  }

  // ── 3. CRM pipeline entry for the parent contact ─────────────────────────

  if (contactId) {
    try {
      const { data: existingPipeline } = await (sb as any)
        .from('crm_pipeline')
        .select('id, stage')
        .eq('contact_id', contactId)
        .maybeSingle();

      const pipelinePayload = {
        contact_id:   contactId,
        contact_name: parentName,
        contact_type: 'form_lead',
        updated_at:   now,
      };

      if (existingPipeline) {
        // Only move forward in the pipeline, never backwards
        const stageOrder = ['lead', 'enquiry', 'contacted', 'trial', 'enrolled'];
        const currentIdx = stageOrder.indexOf(existingPipeline.stage);
        if (currentIdx < stageOrder.indexOf('enquiry')) {
          await (sb as any).from('crm_pipeline').update({ ...pipelinePayload, stage: 'enquiry' }).eq('contact_id', contactId);
        }
      } else {
        await (sb as any).from('crm_pipeline').insert({ ...pipelinePayload, stage: 'enquiry', created_at: now });
      }
    } catch {
      // Non-fatal
    }
  }

  // ── 4. CRM interaction log ────────────────────────────────────────────────

  if (contactId) {
    try {
      await (sb as any).from('crm_interactions').insert({
        contact_id:   contactId,
        contact_name: parentName,
        contact_type: 'form_lead',
        type:         'form_submission',
        direction:    'inbound',
        content:      `Submitted public form: "${formTitle}". Child: ${childName}, Age ${childAge}, Class ${childClass}. Programme interest: ${courseLabel ?? 'not specified'}.`,
        created_at:   now,
      });
    } catch {
      // Non-fatal
    }
  }

  return { contactId, prospectId };
}

// POST /api/public/consent-forms/[id]
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const sb = adminClient();

  const { data: form, error: formErr } = await sb
    .from('consent_forms')
    .select('id, title, school_id, form_type, is_public, schools(name, email)')
    .eq('id', id)
    .single();

  if (formErr || !form || !form.is_public) {
    return NextResponse.json({ error: 'Form not found or no longer accepting submissions' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { response_data = {}, child_current_school, email } = body;

  if (!response_data.child_name?.trim()) {
    return NextResponse.json({ error: 'Child name is required' }, { status: 400 });
  }

  // ── Fuzzy-match child's school ────────────────────────────────────────────
  let matched_school_id: string | null = null;
  let matchedSchoolName: string | undefined;
  if (child_current_school?.trim()) {
    const { data: schoolMatch } = await sb
      .from('schools')
      .select('id, name')
      .ilike('name', `%${child_current_school.trim()}%`)
      .limit(1)
      .maybeSingle();
    matched_school_id = schoolMatch?.id ?? null;
    matchedSchoolName = (schoolMatch as any)?.name;
  }

  // ── Save form lead ────────────────────────────────────────────────────────
  const { data: lead, error: insertErr } = await sb
    .from('form_leads')
    .insert({
      form_id: id,
      school_id: form.school_id ?? null,
      matched_school_id,
      child_current_school: child_current_school?.trim() || null,
      email: email?.trim() || null,
      response_data,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const schoolData = (form as any).schools as { name?: string; email?: string } | null;
  const schoolName = schoolData?.name ?? 'Rillcod Technologies';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const toEmail = email?.trim();

  // ── CRM reconciliation (non-blocking) ────────────────────────────────────
  const { contactId, prospectId } = await reconcileWithCRM(sb, {
    parentName:       response_data.parent_name || 'Parent/Guardian',
    parentEmail:      response_data.parent_email || toEmail || '',
    parentWhatsapp:   response_data.parent_whatsapp || '',
    childName:        response_data.child_name,
    childAge:         response_data.child_age || '',
    childClass:       response_data.child_class || '',
    programCategory:  response_data.program_category || '',
    currentSchool:    child_current_school?.trim() || null,
    matchedSchoolId:  matched_school_id,
    schoolId:         form.school_id ?? null,
    schoolName,
    formId:           lead!.id,
    formTitle:        form.title,
    referralSource:   response_data.referral_source,
    preferredSchedule: response_data.preferred_schedule,
    hearAboutUs:      response_data.hear_about_us,
  });

  // Back-fill contact_id + prospect_id on the lead row
  if (contactId || prospectId) {
    await (sb as any)
      .from('form_leads')
      .update({ contact_id: contactId, prospect_id: prospectId })
      .eq('id', lead!.id);
  }

  // ── Confirmation email to parent ──────────────────────────────────────────
  if (toEmail && toEmail.includes('@')) {
    try {
      const html = buildFormLeadConfirmationEmail({
        parentName:      response_data.parent_name || 'Parent/Guardian',
        childName:       response_data.child_name,
        programCategory: response_data.program_category,
        formTitle:       form.title,
        schoolName,
        formType:        form.form_type ?? 'general',
        appUrl,
      });
      await notificationsService.sendEmail('system', {
        to: toEmail,
        subject: `✅ Registration Received — Rillcod Technologies`,
        html,
        fromName: 'Rillcod Technologies',
        replyTo: 'support@rillcod.com',
      });
    } catch { /* non-fatal */ }
  }

  // ── Notification email to school ──────────────────────────────────────────
  const staffEmail = schoolData?.email;
  if (staffEmail && staffEmail.includes('@')) {
    try {
      const { data: matchedSchool } = matched_school_id
        ? await sb.from('schools').select('name').eq('id', matched_school_id).single()
        : { data: null };

      const html = buildLeadNotificationEmail({
        schoolName,
        formTitle:         form.title,
        childName:         response_data.child_name,
        childAge:          response_data.child_age,
        childClass:        response_data.child_class,
        programCategory:   response_data.program_category,
        parentName:        response_data.parent_name,
        parentWhatsapp:    response_data.parent_whatsapp,
        parentEmail:       response_data.parent_email || toEmail,
        currentSchool:     child_current_school?.trim() || undefined,
        matchedSchoolName: (matchedSchool as any)?.name ?? matchedSchoolName,
        dashboardUrl:      appUrl,
      });
      await notificationsService.sendEmail('system', {
        to: staffEmail,
        subject: `🔔 New Enquiry: ${response_data.child_name} — ${form.title}`,
        html,
        fromName: 'Rillcod Forms',
        replyTo: toEmail || 'support@rillcod.com',
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ success: true, id: lead?.id });
}
