import type { SupabaseClient } from '@supabase/supabase-js';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';
import { isLeadMarketingEmailAllowed } from '@/lib/marketing/consent';
import { programSpotlightHtml, programSpotlightLinks } from '@/lib/communication/program-spotlight';

type AnySupabase = SupabaseClient<any>;

/**
 * Warm, paced email conversation for consent-form leads who opted in.
 * Three touches over ~4 weeks — not daily spam. Stops when they convert.
 */

export interface NurtureContext {
  parentName: string;
  childName: string;
  programme: string | null;
  schoolName: string;
  appUrl: string;
  formTitle: string;
}

interface NurtureStep {
  dayThreshold: number;
  subject: (c: NurtureContext) => string;
  body: (c: NurtureContext) => string;
}

function programmeBlurb(programme: string | null): string {
  if (!programme) return 'coding, robotics and creative tech';
  if (/young/i.test(programme)) return 'fun, hands-on coding for ages 5–10';
  if (/teen/i.test(programme)) return 'real apps and Python for ages 11–19';
  return programme;
}

const links = () => programSpotlightLinks();

export const NURTURE_STEPS: NurtureStep[] = [
  {
    dayThreshold: 7,
    subject: (c) => `${c.childName.split(' ')[0]}'s place at Rillcod — we're still here for you`,
    body: (c) => `
      <p style="margin:0 0 12px;">Hi ${c.parentName.split(' ')[0]},</p>
      <p style="margin:0 0 12px;">Thank you again for registering <strong>${c.childName}</strong>. Our team is still reviewing details and we'd love to welcome them to ${programmeBlurb(c.programme)}.</p>
      <p style="margin:0 0 12px;">Have a question about fees, class times, or what they'll build? Just reply — a real person reads every message.</p>
      ${programSpotlightHtml()}`,
  },
  {
    dayThreshold: 21,
    subject: (c) => `Summer School & classes — options for ${c.childName.split(' ')[0]}`,
    body: (c) => `
      <p style="margin:0 0 12px;">Hi ${c.parentName.split(' ')[0]},</p>
      <p style="margin:0 0 12px;">Many families ask what else Rillcod offers beyond the regular term. Right now we're enrolling for <strong>Summer School</strong> as well as our Young Innovators and Teen Developers classes.</p>
      <p style="margin:0 0 12px;">If ${c.childName} joins, they'll build real projects — games, apps, robots — not just sit in front of slides. You'll see progress in the parent portal too.</p>
      ${programSpotlightHtml()}
      <p style="margin:12px 0 0;"><a href="${links().summerSchool}" style="color:#f59e0b;font-weight:700;">View Summer School →</a></p>`,
  },
  {
    dayThreshold: 28,
    subject: (c) => `Shall we get ${c.childName.split(' ')[0]} started?`,
    body: (c) => `
      <p style="margin:0 0 12px;">Dear ${c.parentName},</p>
      <p style="margin:0 0 12px;">We'd love to confirm <strong>${c.childName}</strong>'s spot when you're ready. Reply to this email or call <a href="tel:${brandContact.phone}" style="color:#f59e0b;">${brandContact.phone}</a> and we'll walk you through login, class schedule and fees — step by step.</p>
      <p style="margin:0 0 12px;">Not the right time? No pressure — tell us and we'll keep your details for a future term.</p>`,
  },
];

const MIN_GAP_MS = 7 * 24 * 60 * 60 * 1000; // at most one step per week

export async function processLeadNurture(
  admin: AnySupabase,
  lead: { id: string; email: string | null; response_data: unknown; submitted_at: string | null; matched_parent_id?: string | null; status?: string | null },
): Promise<number> {
  const rd = (lead.response_data ?? {}) as Record<string, unknown>;

  if (lead.matched_parent_id) return 0;
  if (lead.status && ['enrolled', 'lost', 'converted'].includes(String(lead.status))) return 0;

  const to = String(rd.parent_email || lead.email || '').trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(to)) return 0;

  const currentStep = Number(rd.nurture_step || 0);
  if (!(await isLeadMarketingEmailAllowed(admin, to, rd))) return 0;
  if (currentStep >= NURTURE_STEPS.length) return 0;

  const submittedMs = lead.submitted_at ? new Date(lead.submitted_at).getTime() : Date.now();
  const daysSince = (Date.now() - submittedMs) / 86400000;

  const lastAt = rd.nurture_last_at ? new Date(String(rd.nurture_last_at)).getTime() : 0;
  if (Date.now() - lastAt < MIN_GAP_MS) return 0;

  const step = NURTURE_STEPS[currentStep];
  if (daysSince < step.dayThreshold) return 0;

  const ctx: NurtureContext = {
    parentName: String(rd.parent_name || 'Parent/Guardian'),
    childName: String(rd.child_name || 'your child'),
    programme: rd.program_category ? String(rd.program_category) : null,
    schoolName: 'Rillcod Technologies',
    appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, ''),
    formTitle: String(rd.form_title || 'Rillcod Registration'),
  };

  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'From the Rillcod team',
      title: step.subject(ctx),
      bodyHtml: step.body(ctx),
      footerNote: `${brandContact.displayName} · Reply any time — we read every message`,
    });
    await notificationsService.sendExternalEmail({
      to,
      subject: step.subject(ctx),
      html,
      fromName: 'Rillcod',
      fromEmail: SMTP_FROM_EMAIL,
      replyTo: SMTP_FROM_EMAIL,
      automated: true,
      eventType: 'lead_nurture',
      referenceId: `${lead.id}:step:${currentStep + 1}`,
    } as Parameters<typeof notificationsService.sendExternalEmail>[0]);
  } catch (err) {
    console.error('[lead-nurture] send failed:', err);
    return 0;
  }

  await admin.from('form_leads')
    .update({ response_data: { ...rd, nurture_step: currentStep + 1, nurture_last_at: new Date().toISOString() } })
    .eq('id', lead.id);

  return currentStep + 1;
}
