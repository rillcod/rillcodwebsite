/**
 * What we say to a school before they are a partner — written once.
 *
 * The same four angles existed in three places: the outbound email builder, the
 * outreach modal's copy-to-clipboard text, and the pitch buttons beside a
 * document preview. Three copies of a sales pitch drift, and these had: one
 * promised a thirty-percent share as "guaranteed", one called the programme
 * accredited, and all three led with robotics.
 *
 * Two rules hold this file together.
 *
 *   Nothing here states a price, a percentage or a share. Commercial terms live
 *   in `partnership_terms` and print on the document from that record. An email
 *   that quotes a figure is a figure nobody agreed, sent to the one person who
 *   will hold us to it. `containsCommercialClaim` is asserted over every string
 *   in this file by its test.
 *
 *   Nothing here promises more than is delivered. Coding and applied AI are the
 *   programme; hardware is real but it is part of the practical work, not a
 *   robotics department. Overselling at the pitch is paid for at renewal, by
 *   which time the school has told its parents.
 */
import { brandContact } from '@/config/brand';

export type OutreachAngle = 'cold_pitch' | 'free_demo' | 'check_in' | 'resumption_slot';

export type OutreachPoint = { label: string; body: string };

export type OutreachMessage = {
  subject: string;
  /** The banner line in an email. Plain-text renderings drop it. */
  title: string;
  /** Paragraphs before the list. */
  opening: string[];
  list?: { heading: string; points: OutreachPoint[] };
  /** Paragraphs after the list. */
  closing: string[];
  /** What the button or the last line should say. */
  ctaLabel: string;
};

export type OutreachContext = {
  schoolName: string;
  contactName?: string | null;
  reference?: string | null;
  /** The public link, when there is a document to point at. */
  shareUrl?: string | null;
};

export const OUTREACH_ANGLES: ReadonlyArray<{
  id: OutreachAngle;
  label: string;
  icon: string;
  desc: string;
}> = [
  {
    id: 'cold_pitch',
    label: 'Introduction',
    icon: '🌟',
    desc: 'What the programme is, who teaches it, and what the school has to provide.',
  },
  {
    id: 'free_demo',
    label: 'Free session invite',
    icon: '💡',
    desc: 'Offer one free session with a class so their staff can judge it firsthand.',
  },
  {
    id: 'check_in',
    label: 'Proposal follow-up',
    icon: '💬',
    desc: 'Polite check-in on a proposal already sent, with the link to read it.',
  },
  {
    id: 'resumption_slot',
    label: 'Reserve next term',
    icon: '📅',
    desc: 'Ask for sign-off in time to hold a facilitator and a timetable slot.',
  },
];

function greet(ctx: OutreachContext): string {
  return ctx.contactName?.trim()
    ? `Dear ${ctx.contactName.trim()},`
    : `Dear ${ctx.schoolName} Leadership,`;
}

/**
 * The words for one angle, as structure rather than markup.
 *
 * Callers render it: the email builder wraps each part in its own HTML, the
 * clipboard and WhatsApp paths flatten it to text. Returning HTML here would
 * mean escaping a school's name for a WhatsApp message.
 */
export function buildOutreachMessage(angle: OutreachAngle, ctx: OutreachContext): OutreachMessage {
  const school = ctx.schoolName;
  const greeting = greet(ctx);

  switch (angle) {
    case 'free_demo':
      return {
        subject: `A free session for your learners at ${school}`,
        title: 'See it taught before you decide',
        opening: [
          greeting,
          `We would like to run one free session at ${school} — about thirty minutes with a single class, at whatever point in the week suits your timetable.`,
        ],
        list: {
          heading: 'What the class actually does',
          points: [
            {
              label: 'Write code that runs',
              body: 'Every learner types something, runs it, and sees it work or fail on screen in front of them.',
            },
            {
              label: 'Train a small model',
              body: 'The class teaches a model to tell two things apart using their own examples, then finds the cases it gets wrong.',
            },
            {
              label: 'Make hardware respond',
              body: 'A micro-controller is wired to a sensor and programmed to react to it — the point where code stops being abstract.',
            },
          ],
        },
        closing: [
          'There is no cost and no obligation attached to it. It is the quickest way for your staff to judge whether this belongs on your timetable, and for your learners to tell you whether they want it.',
        ],
        ctaLabel: 'Arrange a session',
      };

    case 'check_in':
      return {
        subject: `Following up on our partnership proposal for ${school}${
          ctx.reference ? ` (${ctx.reference})` : ''
        }`,
        title: 'Any questions on the proposal?',
        opening: [
          greeting,
          `I am following up on the partnership proposal we prepared for ${school}.`,
          'Happy to talk through any part of it — how the curriculum is laid out year by year, how the weekly slot works alongside your existing timetable, or the commercial terms as set out in the document.',
        ],
        closing: [
          'Would a ten-minute call suit you this week, or would you rather we came in and talked it through in person?',
        ],
        ctaLabel: 'Read the proposal online',
      };

    case 'resumption_slot':
      return {
        subject: `Holding a timetable slot at ${school} for next term`,
        title: 'Reserving your slot for resumption',
        opening: [
          greeting,
          `We are setting facilitator rosters for next term, and I want to make sure ${school} keeps the weekly slot you would prefer rather than what is left.`,
          'Signing the Memorandum of Understanding reserves a facilitator and the equipment for that slot, so teaching starts in the first weeks of resumption instead of somewhere in the middle of the term.',
        ],
        closing: [
          'Nothing is payable to reserve it. The equipment arrives with the facilitator, and billing follows the terms set out in the agreement itself.',
        ],
        ctaLabel: 'Read and sign the agreement',
      };

    case 'cold_pitch':
    default:
      return {
        subject: `Coding and AI on the timetable at ${school}, without the capital outlay`,
        title: `A coding and AI programme for ${school}`,
        opening: [
          greeting,
          'Computer studies as most schools still teach it — word processing, and the names of the parts inside a PC — is not what parents are asking about any more. They want to know whether their child will be able to build something.',
          `${brandContact.displayName} runs a coding and applied artificial intelligence programme on your own timetable, taught by our facilitators. The curriculum, the learning platform, the devices and the training are ours; the room and the slot are yours.`,
        ],
        list: {
          heading: 'What a partnership gives your school',
          points: [
            {
              label: 'Specialists teach it, your teachers inherit it',
              body: 'Our facilitators deliver every session on your site, so nothing is added to an existing teacher’s load. Your staff observe and then co-teach, and the capability ends up inside the school.',
            },
            {
              label: 'A ladder, not a computer club',
              body: 'A twelve-year progression, from block-based coding in the lower years to Python and applied AI in the senior years. Every year builds on the one before it.',
            },
            {
              label: 'Hardware where the year calls for it',
              body: 'Micro-controllers, sensors and circuits are part of the practical work in the years that use them. They arrive with the facilitator and leave with them; your school buys none of it.',
            },
            {
              label: 'No capital outlay, and no idle laboratory',
              body: 'There is no room to build out and no equipment to depreciate between terms. You provide the space and the timetable slot.',
            },
            {
              label: 'Evidence your admissions team can show',
              body: 'Every learner keeps a portfolio of work that runs, and finishes each term with a written progress report you and the parents both receive.',
            },
            {
              label: 'A share of the fees, settled each term',
              body: 'The programme is billed to parents and your school takes a share of it. The split, and the billing model behind it, are set out in the proposal.',
            },
          ],
        },
        closing: [
          `We would be glad of twenty minutes with you, or to run a free session with one class at ${school} so your staff can watch it being taught before anything is decided.`,
        ],
        ctaLabel: 'Read the full proposal online',
      };
  }
}

/**
 * The same message as something you can paste into WhatsApp.
 *
 * Deliberately sparse on decoration: this gets read on a phone, usually in a
 * hurry, and a wall of emoji reads as a broadcast rather than a letter from a
 * person.
 */
export function outreachPlainText(
  angle: OutreachAngle,
  ctx: OutreachContext,
): { subject: string; body: string } {
  const msg = buildOutreachMessage(angle, ctx);
  const parts: string[] = [...msg.opening];

  if (msg.list) {
    parts.push(`${msg.list.heading}:`);
    parts.push(msg.list.points.map((p) => `• ${p.label} — ${p.body}`).join('\n'));
  }

  parts.push(...msg.closing);
  if (ctx.shareUrl) parts.push(`${msg.ctaLabel}:\n${ctx.shareUrl}`);
  parts.push(`Warm regards,\n${brandContact.displayName}\n${brandContact.phone}`);

  return { subject: msg.subject, body: parts.join('\n\n') };
}
