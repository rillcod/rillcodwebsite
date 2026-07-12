import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertBookParent, resolveCanonicalCrmContactId, promoteBookLeadToPortalIfLinked } from '@/lib/crm/contact-book';
import { insertCrmInteraction, upsertCrmPipeline } from '@/lib/crm/pipeline';
import { crmContactTypeFromRole } from '@/lib/crm/stages';

type AnySupabase = SupabaseClient<any>;

export interface ReconcileResult {
  /** Canonical id for crm_* activity (portal preferred). */
  contactId: string | null;
  bookId: string | null;
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

/**
 * Mine a lead into CRM: upsert parent into customer_contact_book (intake),
 * child into prospective_students, and write pipeline/interaction onto the
 * *canonical* contact id (portal parent if email matches, else book).
 */
export async function reconcileLeadWithCrm(sb: AnySupabase, params: ReconcileLeadParams): Promise<ReconcileResult> {
  const {
    parentName, parentEmail, parentWhatsapp, childName, childAge, childClass,
    childGender, childDob, whatsappOptIn,
    programCategory, currentSchool, matchedSchoolId, schoolId, schoolName,
    formId, formTitle, referralSource, preferredSchedule, hearAboutUs,
    priorCoding, priorPlatform, devices, learningGoal, specialNotes,
  } = params;

  const now = new Date().toISOString();
  const courseLabel =
    programCategory === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' :
    programCategory === 'teen_developers'  ? 'Teen Developers (SEC · Ages 11–19)' :
    programCategory || null;

  let bookId: string | null = null;
  let contactId: string | null = null;
  let prospectId: string | null = null;

  // ── 1. customer_contact_book (intake SoT) ─────────────────────────────────
  try {
    bookId = await upsertBookParent(sb, {
      fullName: parentName,
      email: parentEmail,
      phone: parentWhatsapp,
      schoolName,
      source: 'consent_form',
      lastChannel: 'consent_form',
      formId,
      formTitle,
      childEntry: {
        name: childName, age: childAge, class: childClass, program: courseLabel, school: currentSchool,
        gender: childGender || undefined, date_of_birth: childDob || undefined,
      },
      extraMeta: whatsappOptIn ? { whatsapp_opt_in: true } : {},
    });
  } catch { /* non-fatal */ }

  // ── 2. Canonical CRM contact (portal preferred) ──────────────────────────
  try {
    const canonical = await resolveCanonicalCrmContactId(sb, {
      email: parentEmail,
      phone: parentWhatsapp,
      bookId,
    });
    contactId = canonical.contactId;
    if (!bookId) bookId = canonical.bookId;
  } catch { /* non-fatal */ }

  // ── 3. prospective_students (child) ──────────────────────────────────────
  try {
    const email = parentEmail?.trim() || null;
    const phone = parentWhatsapp?.replace(/\D/g, '') || null;
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

  // ── 4. Pipeline + interaction on ONE canonical contact ────────────────────
  if (contactId) {
    const contactType = crmContactTypeFromRole(
      contactId === bookId ? 'form_lead' : 'parent',
    );
    const content =
      `Submitted public form: "${formTitle}". Child: ${childName}${childGender ? ` (${childGender})` : ''}, Age ${childAge}, Class ${childClass}. Programme: ${courseLabel ?? 'not specified'}.`;
    try {
      await upsertCrmPipeline(sb, {
        contactId,
        contactName: parentName,
        contactType,
        stage: 'prospect',
        promoteOnly: true,
      });
    } catch { /* non-fatal */ }
    try {
      await insertCrmInteraction(sb, {
        contactId,
        contactName: parentName,
        contactType,
        type: 'form_submission',
        direction: 'inbound',
        content,
      });
    } catch { /* non-fatal */ }
  }

  // ── 5. If portal parent already exists, move any book-keyed CRM onto it ───
  if (bookId) {
    try {
      const promo = await promoteBookLeadToPortalIfLinked(sb, {
        bookId,
        email: parentEmail,
        phone: parentWhatsapp,
      });
      if (promo.portalId) contactId = promo.portalId;
    } catch { /* non-fatal */ }
  }

  return { contactId, bookId, prospectId };
}
