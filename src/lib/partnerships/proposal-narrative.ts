/**
 * The words of a proposal — authored by default, tailored by AI on request.
 *
 * The commercial content of a proposal is never generated. Fees come from
 * PARTNERSHIP_OFFERS, agreed rates come from partnership_terms, and the twelve
 * years come from the published curriculum edition. What a model may write is
 * the pitch around them: why this school, why now, what changes for their
 * parents. A proposal that invented its own price would recreate, with more
 * conviction, exactly the drift this whole system was built to end.
 *
 * That rule is enforced rather than trusted. `containsCommercialClaim` rejects
 * any generated block that states money, a percentage or a per-term rate, and a
 * rejected block falls back to the authored copy. The proposal still goes out —
 * it just goes out in the words we wrote.
 *
 * Generation is opt-in and always fails soft: no key, a slow model, a refusal or
 * a malformed answer all end at the authored narrative, because a school waiting
 * on a proposal should never be blocked by an AI provider.
 */
import { generateAIContent } from '@/lib/ai/generate-core';
import type { CurriculumProgression } from './curriculum';
import type { PartnershipOffer } from './offers';

export type ProposalBenefit = { title: string; body: string };

export type ProposalNarrative = {
  headline: string;
  opening: string;
  benefits: ProposalBenefit[];
  closing: string;
  /** Which pen wrote this — surfaced in the builder so a human knows to read it. */
  source: 'authored' | 'ai';
};

/** The house pitch. Always valid, always the fallback, never worse than nothing. */
export const AUTHORED_NARRATIVE: ProposalNarrative = {
  headline: 'Coding, Robotics &amp; AI for every year group',
  opening:
    'Parents are choosing schools on whether their children will be ready for work that does not exist yet. A coding and robotics programme is the clearest signal a school can give that it is preparing them for it — and the clearest reason for a parent to choose you over the school down the road.',
  benefits: [
    {
      title: 'Taught, not outsourced',
      body: 'Rillcod facilitators deliver every session on your site, to your timetable, with your teachers observing and taking it on over time.',
    },
    {
      title: 'A ladder, not a club',
      body: 'Year on year progression, so a child who starts in Basic 1 leaves SS 3 having shipped real work.',
    },
    {
      title: 'Evidence for parents',
      body: 'Every learner keeps a portfolio and a termly capstone build. Progress is reported to you and to families, not asserted.',
    },
    {
      title: 'No capital outlay',
      body: 'Hardware, curriculum, the learning platform and facilitator training are ours. The school provides the room and the timetable slot.',
    },
  ],
  closing:
    'If the shape works, we issue a Memorandum of Understanding stating the agreed fee and the obligations above, and we can begin the term after signing.',
  source: 'authored',
};

/**
 * Does this text make a commercial claim the model had no authority to make?
 *
 * Money, percentages and per-term rates all belong to the stored record. Catching
 * them here is cheaper than discovering a proposal quoted a fee nobody agreed.
 */
export function containsCommercialClaim(text: string): boolean {
  const t = String(text ?? '');
  return (
    /₦|\bNGN\b|\bnaira\b/i.test(t) ||
    /\b\d{1,3}(,\d{3})+\b/.test(t) ||
    /\b\d+\s*%/.test(t) ||
    /\bper\s+(student|child|learner|term)\b/i.test(t) ||
    /\b(free|discount|refund|guarantee[ds]?)\b/i.test(t)
  );
}

/** Is this a narrative we would put in front of a head teacher? */
export function isUsableNarrative(value: unknown): value is ProposalNarrative {
  const n = value as ProposalNarrative | null;
  if (!n || typeof n !== 'object') return false;
  if (typeof n.headline !== 'string' || n.headline.trim().length < 12) return false;
  if (typeof n.opening !== 'string' || n.opening.trim().length < 120) return false;
  if (typeof n.closing !== 'string' || n.closing.trim().length < 40) return false;
  if (!Array.isArray(n.benefits) || n.benefits.length !== 4) return false;
  for (const b of n.benefits) {
    if (!b || typeof b.title !== 'string' || b.title.trim().length < 4) return false;
    if (typeof b.body !== 'string' || b.body.trim().length < 60) return false;
    if (containsCommercialClaim(b.title) || containsCommercialClaim(b.body)) return false;
  }
  return !(
    containsCommercialClaim(n.headline) ||
    containsCommercialClaim(n.opening) ||
    containsCommercialClaim(n.closing)
  );
}

export type NarrativeContext = {
  school: { name: string; city?: string | null; state?: string | null; student_count?: number | null };
  curriculum?: CurriculumProgression | null;
  offers?: readonly PartnershipOffer[];
  /** Anything the salesperson knows that the database does not. */
  notes?: string | null;
};

function buildPrompt(ctx: NarrativeContext): string {
  const where = [ctx.school.city, ctx.school.state].filter(Boolean).join(', ');
  const ladder = ctx.curriculum
    ? ctx.curriculum.levels.map((l) => `${l.grade}: ${l.theme}`).join('; ')
    : 'a multi-year coding, robotics and AI progression';

  return [
    'You are writing the persuasive copy of a partnership proposal from Rillcod Academy,',
    'a STEM, robotics and AI education partner, to a Nigerian private school.',
    '',
    `School: ${ctx.school.name}${where ? ` in ${where}` : ''}.`,
    ctx.school.student_count ? `Approximate enrolment: ${ctx.school.student_count} students.` : '',
    `Curriculum on offer: ${ladder}.`,
    ctx.notes ? `Context from our team: ${ctx.notes}` : '',
    '',
    'Write for the school proprietor or head teacher. They care about enrolment, parent',
    'perception against nearby schools, and whether this creates work for their staff.',
    'Be concrete and plain. No exclamation marks, no hype, no bullet-point padding.',
    'Use British spelling. Never address the reader as "you guys" or use emoji.',
    '',
    'ABSOLUTE RULE: do not mention any price, fee, amount, currency, percentage,',
    'discount, or per-student/per-term rate. Commercial terms are inserted separately',
    'from a signed record. Text containing any figure will be discarded entirely.',
    '',
    'Return ONLY JSON in exactly this shape:',
    '{',
    '  "headline": "short, 6-9 words, no school name",',
    '  "opening": "one paragraph, 45-75 words, why this school and why now",',
    '  "benefits": [',
    '    { "title": "3-5 words", "body": "one sentence, 20-35 words" },',
    '    { "title": "...", "body": "..." },',
    '    { "title": "...", "body": "..." },',
    '    { "title": "...", "body": "..." }',
    '  ],',
    '  "closing": "one sentence on the next step after they agree"',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

function coerce(raw: unknown): ProposalNarrative | null {
  let parsed: any = raw;
  if (typeof parsed === 'string') {
    const fence = parsed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const start = fence.indexOf('{');
    const end = fence.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(fence.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const candidate: ProposalNarrative = {
    headline: String(parsed.headline ?? '').trim(),
    opening: String(parsed.opening ?? '').trim(),
    benefits: Array.isArray(parsed.benefits)
      ? parsed.benefits.slice(0, 4).map((b: any) => ({
          title: String(b?.title ?? '').trim(),
          body: String(b?.body ?? '').trim(),
        }))
      : [],
    closing: String(parsed.closing ?? '').trim(),
    source: 'ai',
  };
  return isUsableNarrative(candidate) ? candidate : null;
}

/**
 * Tailored copy for one school, or the authored copy when that is not available.
 *
 * Never throws and never returns something unusable, so a caller can render the
 * result unconditionally.
 */
export async function buildProposalNarrative(
  ctx: NarrativeContext,
  opts?: { useAI?: boolean },
): Promise<ProposalNarrative> {
  if (!opts?.useAI) return AUTHORED_NARRATIVE;

  try {
    const result = await generateAIContent({
      type: 'custom',
      topic: `Partnership proposal narrative for ${ctx.school.name}`,
      prompt: buildPrompt(ctx),
      tone: 'professional',
      audience: 'school proprietor',
    } as Parameters<typeof generateAIContent>[0]);

    return coerce(result?.content ?? result?.data) ?? AUTHORED_NARRATIVE;
  } catch (error) {
    console.error('[proposal-narrative] generation failed, using authored copy:', error);
    return AUTHORED_NARRATIVE;
  }
}
