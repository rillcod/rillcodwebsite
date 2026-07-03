import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export interface ReconcileResult {
  contactId: string | null;
  prospectId: string | null;
}

export interface ReconcileLeadParams {
  parentName: string; parentEmail: string; parentWhatsapp: string;
  childName: string; childAge: string; childClass: string;
  programCategory: string; currentSchool: string | null;
  matchedSchoolId: string | null; schoolId: string | null; schoolName: string;
  formId: string; formTitle: string;
  referralSource?: string; preferredSchedule?: string; hearAboutUs?: string;
  priorCoding?: string; priorPlatform?: string; devices?: string[];
  learningGoal?: string; specialNotes?: string;
}

/**
 * Mine a lead's parent + child into the CRM: upsert the parent into
 * customer_contact_book (with their children array), the child into
 * prospective_students, and advance the crm_pipeline. Shared by the public consent
 * submission AND the result/ID-card self-service intake so both capture identical,
 * complete contact data. Each step is best-effort — CRM capture never blocks the flow.
 */
export async function reconcileLeadWithCrm(sb: AnySupabase, params: ReconcileLeadParams): Promise<ReconcileResult> {
  const {
    parentName, parentEmail, parentWhatsapp, childName, childAge, childClass,
    programCategory, currentSchool, matchedSchoolId, schoolId, schoolName,
    formId, formTitle, referralSource, preferredSchedule, hearAboutUs,
    priorCoding, priorPlatform, devices, learningGoal, specialNotes,
  } = params;

  const now   = new Date().toISOString();
  const phone = parentWhatsapp?.replace(/\D/g, '') || null;
  const email = parentEmail?.trim() || null;

  const courseLabel =
    programCategory === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' :
    programCategory === 'teen_developers'  ? 'Teen Developers (SEC · Ages 11–19)' :
    programCategory || null;

  let contactId: string | null = null;
  let prospectId: string | null = null;

  // ── 1. customer_contact_book (parent) ────────────────────────────────────
  try {
    let existing: { id: string; metadata: Record<string, unknown> } | null = null;
    if (email) {
      const { data } = await sb.from('customer_contact_book').select('id, metadata').eq('email', email).maybeSingle();
      existing = data;
    }
    if (!existing && phone) {
      const { data } = await sb.from('customer_contact_book').select('id, metadata').eq('phone', phone).maybeSingle();
      existing = data;
    }

    const childEntry = { name: childName, age: childAge, class: childClass, program: courseLabel, school: currentSchool };

    if (existing) {
      const meta = (existing.metadata as Record<string, unknown>) ?? {};
      const children = Array.isArray(meta.children) ? meta.children as Record<string, unknown>[] : [];
      const idx = children.findIndex(c => String(c.name ?? '').toLowerCase() === childName.toLowerCase());
      if (idx >= 0) children[idx] = { ...children[idx], ...childEntry };
      else children.push(childEntry);
      const formLeads = Array.isArray(meta.form_leads) ? meta.form_leads as string[] : [];
      if (!formLeads.includes(formId)) formLeads.push(formId);
      await sb.from('customer_contact_book').update({
        full_name: parentName, phone: phone ?? undefined, email: email ?? undefined,
        last_channel: 'consent_form', updated_at: now,
        metadata: { ...meta, children, form_leads: formLeads, last_form_title: formTitle, last_form_id: formId },
      }).eq('id', existing.id);
      contactId = existing.id;
    } else {
      const { data: newContact } = await sb.from('customer_contact_book').insert({
        full_name: parentName, email, phone, role: 'parent',
        source: 'consent_form', last_channel: 'consent_form', school_name: schoolName,
        metadata: { children: [childEntry], form_leads: [formId], last_form_title: formTitle, last_form_id: formId },
        confirmed_at: now, created_at: now, updated_at: now,
      }).select('id').single();
      contactId = newContact?.id ?? null;
    }
  } catch { /* non-fatal */ }

  // ── 2. prospective_students (child) ──────────────────────────────────────
  try {
    let existingProspect: { id: string } | null = null;
    if (email) {
      const q = sb.from('prospective_students').select('id').eq('parent_email', email);
      const { data } = await (schoolId ? q.eq('school_id', schoolId) : q).maybeSingle();
      existingProspect = data;
    }
    const assessmentLines: string[] = [];
    if (priorCoding)    assessmentLines.push(`Prior coding: ${priorCoding}${priorPlatform ? ` (${priorPlatform})` : ''}`);
    if (devices?.length) assessmentLines.push(`Devices: ${devices.join(', ')}`);
    if (learningGoal)   assessmentLines.push(`Goal: ${learningGoal}`);
    if (specialNotes)   assessmentLines.push(`Notes: ${specialNotes}`);
    const notesText = [`From consent form: "${formTitle}"`, ...assessmentLines].join('\n');

    const prospectPayload = {
      full_name: childName, email: email ?? `lead-${formId}@noemail.local`,
      age: childAge ? parseInt(childAge, 10) : null, grade: childClass || null,
      course_interest: courseLabel, parent_name: parentName,
      parent_email: email, parent_phone: phone,
      school_id: matchedSchoolId ?? schoolId ?? null,
      school_name: currentSchool ?? schoolName,
      hear_about_us: hearAboutUs ?? referralSource ?? null,
      preferred_schedule: preferredSchedule ?? null,
      notes: notesText,
      status: 'enquiry', updated_at: now,
    };
    if (existingProspect) {
      await sb.from('prospective_students').update(prospectPayload).eq('id', existingProspect.id);
      prospectId = existingProspect.id;
    } else {
      const { data: newP } = await sb.from('prospective_students').insert({
        ...prospectPayload, created_at: now, is_active: true, is_deleted: false,
      }).select('id').single();
      prospectId = newP?.id ?? null;
    }
  } catch { /* non-fatal */ }

  // ── 3. CRM pipeline ──────────────────────────────────────────────────────
  if (contactId) {
    try {
      const { data: pipe } = await sb.from('crm_pipeline').select('id, stage').eq('contact_id', contactId).maybeSingle();
      const stageOrder = ['lead', 'enquiry', 'contacted', 'trial', 'enrolled'];
      const payload = { contact_id: contactId, contact_name: parentName, contact_type: 'form_lead', updated_at: now };
      if (pipe) {
        if (stageOrder.indexOf(pipe.stage) < stageOrder.indexOf('enquiry')) {
          await sb.from('crm_pipeline').update({ ...payload, stage: 'enquiry' }).eq('contact_id', contactId);
        }
      } else {
        await sb.from('crm_pipeline').insert({ ...payload, stage: 'enquiry', created_at: now });
      }
    } catch { /* non-fatal */ }
  }

  // ── 4. CRM interaction ───────────────────────────────────────────────────
  if (contactId) {
    try {
      await sb.from('crm_interactions').insert({
        contact_id: contactId, contact_name: parentName, contact_type: 'form_lead',
        type: 'form_submission', direction: 'inbound',
        content: `Submitted public form: "${formTitle}". Child: ${childName}, Age ${childAge}, Class ${childClass}. Programme: ${courseLabel ?? 'not specified'}.`,
        created_at: now,
      });
    } catch { /* non-fatal */ }
  }

  return { contactId, prospectId };
}
