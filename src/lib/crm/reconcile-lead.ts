import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCrmStage } from '@/lib/crm/scope';

type AnySupabase = SupabaseClient<any>;

export interface ReconcileResult {
  contactId: string | null;
  portalContactId: string | null;
  prospectId: string | null;
}

export interface ReconcileLeadParams {
  parentName: string; parentEmail: string; parentWhatsapp: string;
  childName: string; childAge: string; childClass: string;
  childGender?: string; childDob?: string; whatsappOptIn?: boolean;
  programCategory: string; currentSchool: string | null;
  matchedSchoolId: string | null; schoolId: string | null; schoolName: string;
  formId: string; formTitle: string;
  referralSource?: string; preferredSchedule?: string; hearAboutUs?: string;
  priorCoding?: string; priorPlatform?: string; devices?: string[];
  learningGoal?: string; specialNotes?: string;
}

async function upsertPipeline(
  sb: AnySupabase,
  contactId: string,
  parentName: string,
  contactType: string,
  now: string,
) {
  const { data: pipe } = await sb.from('crm_pipeline').select('id, stage').eq('contact_id', contactId).maybeSingle();
  const stageOrder = ['prospect', 'active', 'at_risk', 'won', 'churned'];
  // Legacy lead stages normalize into the UI vocabulary.
  const current = normalizeCrmStage(pipe?.stage);
  const payload = {
    contact_id: contactId,
    contact_name: parentName,
    contact_type: contactType,
    updated_at: now,
  };
  if (pipe) {
    // Never demote an already-won / active contact on a new form submit.
    if (stageOrder.indexOf(current) <= stageOrder.indexOf('prospect')) {
      await sb.from('crm_pipeline').update({ ...payload, stage: 'prospect' }).eq('contact_id', contactId);
    } else {
      await sb.from('crm_pipeline').update(payload).eq('contact_id', contactId);
    }
  } else {
    await sb.from('crm_pipeline').insert({ ...payload, stage: 'prospect', created_at: now });
  }
}

async function insertFormInteraction(
  sb: AnySupabase,
  contactId: string,
  parentName: string,
  contactType: string,
  content: string,
  now: string,
) {
  await sb.from('crm_interactions').insert({
    contact_id: contactId,
    contact_name: parentName,
    contact_type: contactType,
    type: 'form_submission',
    direction: 'inbound',
    content,
    created_at: now,
  });
}

/**
 * Mine a lead's parent + child into the CRM: upsert the parent into
 * customer_contact_book (with their children array), the child into
 * prospective_students, and advance the crm_pipeline. When a matching
 * portal_users parent exists (same email), dual-write pipeline + interaction
 * onto that portal id so the CRM UI (which lists portal contacts) stays in sync.
 */
export async function reconcileLeadWithCrm(sb: AnySupabase, params: ReconcileLeadParams): Promise<ReconcileResult> {
  const {
    parentName, parentEmail, parentWhatsapp, childName, childAge, childClass,
    childGender, childDob, whatsappOptIn,
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
  let portalContactId: string | null = null;
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

    const childEntry = {
      name: childName, age: childAge, class: childClass, program: courseLabel, school: currentSchool,
      gender: childGender || undefined, date_of_birth: childDob || undefined,
    };

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
        metadata: {
          ...meta, children, form_leads: formLeads, last_form_title: formTitle, last_form_id: formId,
          ...(whatsappOptIn ? { whatsapp_opt_in: true } : {}),
        },
      }).eq('id', existing.id);
      contactId = existing.id;
    } else {
      const { data: newContact } = await sb.from('customer_contact_book').insert({
        full_name: parentName, email, phone, role: 'parent',
        source: 'consent_form', last_channel: 'consent_form', school_name: schoolName,
        metadata: {
          children: [childEntry], form_leads: [formId], last_form_title: formTitle, last_form_id: formId,
          ...(whatsappOptIn ? { whatsapp_opt_in: true } : {}),
        },
        confirmed_at: now, created_at: now, updated_at: now,
      }).select('id').single();
      contactId = newContact?.id ?? null;
    }
  } catch { /* non-fatal */ }

  // ── 1b. Link to existing portal_users parent (same email) ────────────────
  if (email) {
    try {
      const { data: portal } = await sb
        .from('portal_users')
        .select('id')
        .eq('email', email)
        .eq('role', 'parent')
        .maybeSingle();
      portalContactId = portal?.id ?? null;
    } catch { /* non-fatal */ }
  }

  // ── 2. prospective_students (child) ──────────────────────────────────────
  try {
    let existingProspect: { id: string } | null = null;
    if (email && childName.trim()) {
      const q = sb
        .from('prospective_students')
        .select('id')
        .eq('parent_email', email)
        .ilike('full_name', childName.trim());
      const prospectSchoolId = matchedSchoolId ?? schoolId;
      const { data } = await (prospectSchoolId ? q.eq('school_id', prospectSchoolId) : q).limit(1).maybeSingle();
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
      age: childAge ? parseInt(childAge, 10) : null,
      gender: childGender || null,
      grade: childClass || null,
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

  const interactionContent =
    `Submitted public form: "${formTitle}". Child: ${childName}${childGender ? ` (${childGender})` : ''}, Age ${childAge}, Class ${childClass}. Programme: ${courseLabel ?? 'not specified'}.`;

  // ── 3–4. Pipeline + interaction on book contact ───────────────────────────
  if (contactId) {
    try {
      await upsertPipeline(sb, contactId, parentName, 'form_lead', now);
    } catch { /* non-fatal */ }
    try {
      await insertFormInteraction(sb, contactId, parentName, 'form_lead', interactionContent, now);
    } catch { /* non-fatal */ }
  }

  // ── 5. Dual-write onto matching portal_users parent ──────────────────────
  if (portalContactId && portalContactId !== contactId) {
    try {
      await upsertPipeline(sb, portalContactId, parentName, 'parent', now);
    } catch { /* non-fatal */ }
    try {
      await insertFormInteraction(sb, portalContactId, parentName, 'parent', interactionContent, now);
    } catch { /* non-fatal */ }
  }

  return { contactId, portalContactId, prospectId };
}
