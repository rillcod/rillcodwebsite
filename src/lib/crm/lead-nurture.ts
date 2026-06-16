import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Professional, automated lead-nurture "conversation" for consent-form leads.
 *
 * After a parent submits a public consent form we keep a warm, branded email
 * conversation going over the following days — informative, never spammy — to
 * lift engagement and retention until they convert. Each lead advances one step
 * at a time; the sequence stops the moment they convert (a portal account /
 * matched parent) or are marked enrolled/lost.
 *
 * State is tracked on `form_leads.response_data`:
 *   • nurture_step   — last step sent (0 = none)
 *   • nurture_last_at— ISO timestamp of the last send (de-dupe)
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
  /** Days after submission before this step may send. */
  dayThreshold: number;
  subject: (c: NurtureContext) => string;
  body: (c: NurtureContext) => string;
}

function programmeBlurb(programme: string | null): string {
  if (!programme) return 'hands-on coding, robotics and AI';
  if (/young/i.test(programme)) return 'playful, project-based coding built for young minds (ages 5–10)';
  if (/teen/i.test(programme)) return 'real-world coding, apps and AI projects for teens (ages 11–19)';
  return programme;
}

// The conversation. Kept to 3 steps so it feels like genuine, considerate follow-up.
export const NURTURE_STEPS: NurtureStep[] = [
  {
    dayThreshold: 1,
    subject: (c) => `Welcome to the Rillcod family, ${c.parentName.split(' ')[0]} 👋`,
    body: (c) => `
      <p style="margin:0 0 12px;">Dear ${c.parentName}, thank you for registering <strong>${c.childName}</strong> with ${c.schoolName}.</p>
      <p style="margin:0 0 12px;">Here's what happens next: our admissions team is reviewing your details and will confirm ${c.childName}'s placement shortly. In the meantime, here's a little about what's ahead — ${programmeBlurb(c.programme)}, taught by mentors who make learning genuinely fun.</p>
      <p style="margin:0 0 12px;">Have a question about schedules, fees, or what your child will build? Simply reply to this email — a real person will respond. 🙂</p>`,
  },
  {
    dayThreshold: 3,
    subject: (c) => `What ${c.childName.split(' ')[0]} will create at Rillcod ✨`,
    body: (c) => `
      <p style="margin:0 0 12px;">Hi ${c.parentName.split(' ')[0]}, we wanted to share why families love Rillcod.</p>
      <p style="margin:0 0 12px;">Children don't just "learn to code" — they <strong>build real things</strong>: their own games, apps, animations and AI projects they can proudly show you. Every learner gets a personal portal that tracks lessons, badges and progress, so you can follow ${c.childName}'s journey any time.</p>
      <p style="margin:0 0 12px;">Spaces in each cohort are limited to keep classes personal. If you'd like to secure ${c.childName}'s spot, just reply and we'll guide you through the quick next step.</p>`,
  },
  {
    dayThreshold: 6,
    subject: (c) => `Ready to get ${c.childName.split(' ')[0]} started? 🚀`,
    body: (c) => `
      <p style="margin:0 0 12px;">Dear ${c.parentName}, we'd love to welcome <strong>${c.childName}</strong> into the next Rillcod cohort.</p>
      <p style="margin:0 0 12px;">If now is the right time, reply to this email or call us on <a href="tel:+2348116600091" style="color:#7c3aed;">+234 811 660 0091</a> and we'll get everything set up — login details, class schedule and your parent dashboard.</p>
      <p style="margin:0 0 12px;">If the timing isn't right yet, no problem at all — just let us know and we'll keep your details for a future cohort.</p>`,
  },
];

const MIN_GAP_MS = 20 * 60 * 60 * 1000; // never send two steps within ~20h

/** Send the next due nurture step for a lead. Returns the step number sent, or 0. */
export async function processLeadNurture(
  admin: AnySupabase,
  lead: { id: string; email: string | null; response_data: any; submitted_at: string | null; matched_parent_id?: string | null; status?: string | null },
): Promise<number> {
  const rd = (lead.response_data ?? {}) as Record<string, any>;

  // Stop if converted or closed.
  if (lead.matched_parent_id) return 0;
  if (lead.status && ['enrolled', 'lost', 'converted'].includes(String(lead.status))) return 0;

  const to = (rd.parent_email || lead.email || '').trim().toLowerCase();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(to)) return 0;

  const currentStep = Number(rd.nurture_step || 0);
  if (currentStep >= NURTURE_STEPS.length) return 0;

  const submittedMs = lead.submitted_at ? new Date(lead.submitted_at).getTime() : Date.now();
  const daysSince = (Date.now() - submittedMs) / 86400000;

  const lastAt = rd.nurture_last_at ? new Date(rd.nurture_last_at).getTime() : 0;
  if (Date.now() - lastAt < MIN_GAP_MS) return 0;

  const nextStepIndex = currentStep; // steps array is 0-based; currentStep = number already sent
  const step = NURTURE_STEPS[nextStepIndex];
  if (daysSince < step.dayThreshold) return 0;

  const ctx: NurtureContext = {
    parentName: (rd.parent_name as string) || 'Parent/Guardian',
    childName: (rd.child_name as string) || 'your child',
    programme: (rd.program_category as string) || null,
    schoolName: 'Rillcod Technologies',
    appUrl: (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, ''),
    formTitle: (rd.form_title as string) || 'Rillcod Registration',
  };

  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Admissions',
      title: step.subject(ctx),
      bodyHtml: step.body(ctx),
      footerNote: 'rillcod technologies limited • reply any time — we read every message',
    });
    await notificationsService.sendExternalEmail({
      to,
      subject: step.subject(ctx),
      html,
      fromName: 'Rillcod Admissions',
      fromEmail: 'support@rillcod.com',
      replyTo: 'support@rillcod.com',
    } as any);
  } catch (err) {
    console.error('[lead-nurture] send failed:', err);
    return 0;
  }

  // Advance the conversation + WhatsApp a light touch on the final step.
  await admin.from('form_leads')
    .update({ response_data: { ...rd, nurture_step: currentStep + 1, nurture_last_at: new Date().toISOString() } })
    .eq('id', lead.id);

  return currentStep + 1;
}
