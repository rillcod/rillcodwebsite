import type { SupabaseClient } from '@supabase/supabase-js';
import { brandContact } from '@/config/brand';
import {
  buildFormLeadConfirmationEmail,
  buildLeadEnrolledParentEmail,
  buildLeadNotificationEmail,
} from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { hasWhatsAppConsent } from '@/lib/whatsapp/consent';
import {
  buildConsentSubmitWhatsAppAck,
  buildLeadEnrolledWhatsApp,
} from '@/lib/communication/parent-whatsapp-templates';

type AnySupabase = SupabaseClient<any>;

export type ConsentLeadResponseData = {
  parent_name?: string;
  parent_whatsapp?: string;
  parent_email?: string;
  child_name?: string;
  child_age?: string;
  child_class?: string;
  child_gender?: string;
  program_category?: string;
  marketing_email_consent?: boolean;
  whatsapp_consent?: boolean;
  children?: Array<Record<string, string>>;
  [key: string]: string | boolean | Array<Record<string, string>> | undefined;
};

export function consentProgramShortLabel(category?: string | null): string {
  if (category === 'young_innovators') return 'Young Innovators';
  if (category === 'teen_developers') return 'Teen Developers';
  return category || 'coding';
}

export function consentProgramLongLabel(category?: string | null): string {
  if (category === 'young_innovators') return 'Young Innovators (PRY)';
  if (category === 'teen_developers') return 'Teen Developers (SEC)';
  return category || 'coding programme';
}

function childDisplayFromLead(rd: ConsentLeadResponseData): string {
  const childrenArr = Array.isArray(rd.children) ? rd.children : null;
  if (childrenArr?.length) {
    return childrenArr.map((c) => c.name?.trim()).filter(Boolean).join(', ') || 'Child';
  }
  return (rd.child_name || 'Child').trim();
}

/** Parent confirmation after public consent form submit (non-credential). */
export async function deliverConsentParentConfirmationEmail(input: {
  toEmail: string;
  responseData: ConsentLeadResponseData;
  formTitle: string;
  schoolName: string;
  formType?: string | null;
  appUrl?: string;
  isExistingParent?: boolean;
  childrenCount?: number;
  replyTo?: string;
}) {
  const rd = input.responseData;
  const childName = childDisplayFromLead(rd);
  const html = buildFormLeadConfirmationEmail({
    parentName: rd.parent_name || 'Parent/Guardian',
    childName,
    programCategory: input.childrenCount ? undefined : rd.program_category,
    formTitle: input.formTitle,
    schoolName: input.schoolName,
    formType: input.formType ?? 'general',
    appUrl: input.appUrl,
  });

  const subject = input.isExistingParent
    ? `↩️ Welcome Back! We've Received Your Update — Rillcod Technologies`
    : input.childrenCount && input.childrenCount > 1
      ? `✅ Registration Received for ${input.childrenCount} Children — Rillcod Technologies`
      : `✅ Registration Received — Rillcod Technologies`;

  await notificationsService.sendEmail('system', {
    to: input.toEmail,
    subject,
    html,
    fromName: 'Rillcod Technologies',
    replyTo: input.replyTo,
  });
}

/** Immediate WhatsApp ack after consent form submit (non-credential). */
export async function deliverConsentParentWhatsAppAck(input: {
  responseData: ConsentLeadResponseData;
}) {
  const rd = input.responseData;
  const parentWhatsapp = rd.parent_whatsapp?.trim();
  if (!parentWhatsapp || !hasWhatsAppConsent(rd)) return;

  const childrenArr = Array.isArray(rd.children) ? rd.children : null;
  const waMsg = buildConsentSubmitWhatsAppAck({
    parentName: rd.parent_name,
    childName: rd.child_name,
    programCategory: rd.program_category,
    children: childrenArr ?? undefined,
  });

  await sendWhatsApp(parentWhatsapp, waMsg);
}

export type ConsentStaffLeadNotificationInput = {
  admin: AnySupabase;
  schoolId: string | null;
  leadId: string;
  schoolName: string;
  formTitle: string;
  staffEmail?: string | null;
  parentReplyEmail?: string | null;
  responseData: ConsentLeadResponseData;
  childDisplay: string;
  childrenArr?: Array<Record<string, string>> | null;
  needsReview?: boolean;
  isExistingParent?: boolean;
  matchConfidence?: string;
  matchCandidateName?: string;
  matchCandidateClass?: string | null;
  autoMatched?: boolean;
  childAge?: string;
  childClass?: string;
  programCategory?: string;
  currentSchool?: string;
  matchedSchoolName?: string;
  appUrl?: string;
};

/** Staff email + in-app popup when a consent lead is submitted (non-credential). */
export async function deliverConsentStaffLeadNotification(input: ConsentStaffLeadNotificationInput) {
  const rd = input.responseData;
  const childCountNote = input.childrenArr ? ` (${input.childrenArr.length} children)` : '';

  const matchInfo = input.needsReview && input.matchCandidateName
    ? `\n\n⚠️ POSSIBLE EXISTING STUDENT MATCH (${(input.matchConfidence || 'medium').toUpperCase()} confidence): "${input.matchCandidateName}" — ${input.matchCandidateClass ?? 'no class'}. Please review in dashboard.`
    : input.autoMatched && input.matchCandidateName
      ? `\n\n✅ Auto-linked to existing student "${input.matchCandidateName}" — consent spelling applied (no new account).`
      : '';

  const notifTitle = input.needsReview
    ? `⚠️ Match Needed: ${input.childDisplay}`
    : input.isExistingParent
      ? `↩️ Returning Family: ${input.childDisplay}`
      : `🔔 New Enquiry: ${input.childDisplay}`;

  const notifMessage = input.needsReview
    ? `"${input.childDisplay}" (${input.matchConfidence} confidence) may be an existing student. Review & approve in Consent Forms.`
    : input.isExistingParent
      ? `${rd.parent_name} (existing parent) submitted ${input.formTitle} for ${input.childDisplay}${childCountNote}.`
      : `New enquiry from ${rd.parent_name} via "${input.formTitle}". Children: ${input.childDisplay}${childCountNote}.`;

  const emailSubject = input.needsReview
    ? `🔔⚠️ Match Needed: ${input.childDisplay} — ${input.formTitle}`
    : input.isExistingParent
      ? `↩️ Returning Family: ${input.childDisplay} — ${input.formTitle}`
      : `🔔 New Enquiry: ${input.childDisplay}${childCountNote} — ${input.formTitle}`;

  if (input.staffEmail?.includes('@')) {
    const extraChildrenNote = input.childrenArr && input.childrenArr.length > 1
      ? `\n\nADDITIONAL CHILDREN (${input.childrenArr.length - 1} more):\n` +
        input.childrenArr.slice(1).map((c, i) =>
          `Child ${i + 2}: ${c.name || '—'} | ${c.gender || '—'} | Age ${c.age || '—'} | ${c.class || '—'} | ${c.program || '—'}`,
        ).join('\n')
      : '';

    const html = buildLeadNotificationEmail({
      schoolName: input.schoolName,
      formTitle: input.formTitle + matchInfo + extraChildrenNote,
      childName: input.childDisplay,
      childAge: input.childAge ?? rd.child_age,
      childClass: input.childClass ?? rd.child_class,
      programCategory: input.programCategory ?? rd.program_category,
      parentName: rd.parent_name,
      parentWhatsapp: rd.parent_whatsapp,
      parentEmail: rd.parent_email || input.parentReplyEmail || undefined,
      currentSchool: input.currentSchool,
      matchedSchoolName: input.matchedSchoolName,
      dashboardUrl: input.appUrl,
    });

    await notificationsService.sendEmail('system', {
      to: input.staffEmail,
      subject: emailSubject,
      html,
      fromName: 'Rillcod Forms',
      replyTo: input.parentReplyEmail || brandContact.email,
    });
  }

  if (!input.schoolId) return;

  const now = new Date().toISOString();
  const [{ data: schoolStaff }, { data: platformAdmins }] = await Promise.all([
    input.admin
      .from('portal_users')
      .select('id')
      .in('role', ['teacher', 'school'])
      .eq('school_id', input.schoolId)
      .eq('is_active', true)
      .eq('is_deleted', false),
    input.admin
      .from('portal_users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)
      .eq('is_deleted', false),
  ]);

  const staffUsers = [...(schoolStaff ?? []), ...(platformAdmins ?? [])];
  if (!staffUsers.length) return;

  const notifType = input.needsReview ? 'warning' : 'info';
  const notifRows = staffUsers.map((u) => ({
    user_id: u.id,
    title: notifTitle,
    message: notifMessage,
    type: notifType,
    is_read: false,
    created_at: now,
    updated_at: now,
  }));

  await input.admin.from('notifications').insert(notifRows);

  for (const u of staffUsers) {
    try {
      await input.admin.channel(`popup-notifications-${u.id}`).send({
        type: 'broadcast',
        event: 'notification:popup',
        payload: {
          id: `lead-${input.leadId}-${u.id}`,
          title: notifTitle,
          message: notifMessage,
          type: notifType,
          timestamp: now,
          priority: input.needsReview ? 'high' : 'normal',
          autoClose: input.needsReview ? 0 : 6000,
          persistent: input.needsReview,
          actionLabel: 'View Leads',
          actionUrl: '/dashboard/consent-forms',
          category: 'form_lead',
          sound: input.needsReview,
        },
      });
    } catch { /* non-fatal */ }
  }
}

/** Parent enrolled confirmation when staff marks a consent lead enrolled (non-credential). */
export async function deliverConsentLeadEnrolledNotification(input: {
  responseData: ConsentLeadResponseData;
  fallbackEmail?: string | null;
}) {
  const rd = input.responseData;
  const childName = childDisplayFromLead(rd);
  const parentName = rd.parent_name || 'Parent/Guardian';

  const parentWhatsapp = rd.parent_whatsapp?.trim();
  if (parentWhatsapp && hasWhatsAppConsent(rd)) {
    const waMsg = buildLeadEnrolledWhatsApp({
      parentName,
      childName,
      programCategory: rd.program_category,
    });
    await sendWhatsApp(parentWhatsapp, waMsg);
  }

  const toEmail = (rd.parent_email || input.fallbackEmail || '').trim();
  if (toEmail.includes('@')) {
    const html = buildLeadEnrolledParentEmail({
      parentName,
      childName,
      programLabel: consentProgramLongLabel(rd.program_category),
      phone: brandContact.phone,
    });
    await notificationsService.sendEmail('system', {
      to: toEmail,
      subject: `Welcome to Rillcod, ${childName}! 🎉`,
      html,
    });
  }
}

/** Load lead response_data and send enrolled notifications (used by single + bulk status). */
export async function notifyEnrolledConsentLeads(
  admin: AnySupabase,
  leadIds: string[],
) {
  if (!leadIds.length) return;

  const { data: leads } = await admin
    .from('form_leads')
    .select('id, email, response_data')
    .in('id', leadIds);

  for (const lead of leads ?? []) {
    try {
      await deliverConsentLeadEnrolledNotification({
        responseData: (lead.response_data ?? {}) as ConsentLeadResponseData,
        fallbackEmail: lead.email,
      });
    } catch (err) {
      console.error('[notifyEnrolledConsentLeads] failed for', lead.id, err);
    }
  }
}
