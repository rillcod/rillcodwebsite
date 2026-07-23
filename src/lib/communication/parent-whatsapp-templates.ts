import { brandContact } from '@/config/brand';
import { programSpotlightWhatsApp } from '@/lib/communication/program-spotlight';
import { consentProgramShortLabel } from '@/lib/consent/lead-notifications';

/** Immediate registration ack — only when parent opted in to WhatsApp. */
export function buildConsentSubmitWhatsAppAck(input: {
  parentName?: string;
  childName?: string;
  programCategory?: string;
  children?: Array<{ name?: string; program?: string }>;
}): string {
  const parent = input.parentName?.trim() || 'there';

  if (input.children && input.children.length > 1) {
    const childLines = input.children.map((c, i) => {
      const prog = consentProgramShortLabel(c.program);
      return `${i + 1}. ${c.name || 'Child'} — ${prog}`;
    }).join('\n');
    return [
      `Hi ${parent}! 🎉 We've received registrations for ${input.children.length} children at Rillcod Technologies:`,
      '',
      childLines,
      '',
      'Our team will reach out within 24 hours to confirm placements and share next steps.',
      '',
      `Questions? Call us: ${brandContact.phone}`,
      'Reply STOP to opt out.',
    ].join('\n');
  }

  const child = input.childName?.trim() || 'your child';
  const programme = consentProgramShortLabel(input.programCategory);
  return [
    `Hi ${parent}! 🎉 We've received your registration for ${child} in our ${programme} programme at Rillcod Technologies.`,
    '',
    'Our team will reach out within 24 hours to confirm placement and share next steps.',
    '',
    `Questions? Call us: ${brandContact.phone}`,
    'Reply STOP to opt out.',
  ].join('\n');
}

/** Enrolled status update — service message when WhatsApp consent was given. */
export function buildLeadEnrolledWhatsApp(input: {
  parentName: string;
  childName: string;
  programCategory?: string | null;
}): string {
  const prog = consentProgramShortLabel(input.programCategory);
  return [
    `Congratulations ${input.parentName}! 🎊 ${input.childName} is now enrolled in the ${prog} programme at Rillcod Technologies!`,
    '',
    "📅 You'll receive class schedule and onboarding details shortly.",
    `📞 Questions: ${brandContact.phone}`,
    '',
    'Welcome to the Rillcod family! 🚀',
  ].join('\n');
}

/** Week-1 form follow-up (cron). */
export function buildFormFollowupWhatsAppWeek1(input: {
  parentName: string;
  childName: string;
  programLabel: string;
}): string {
  return `Hi ${input.parentName}! 👋 Just checking in about ${input.childName}'s ${input.programLabel} registration at Rillcod. ${programSpotlightWhatsApp(input.childName)} Reply here or call ${brandContact.phone}.`;
}

/** Week-3 form follow-up (cron). */
export function buildFormFollowupWhatsAppWeek3(input: {
  parentName: string;
  childName: string;
  programLabel: string;
}): string {
  return `Hi ${input.parentName}! 🌞 Still thinking about ${input.programLabel} for ${input.childName}? Summer School and term classes are open — we'd love to help. Call ${brandContact.phone} or reply here.`;
}
