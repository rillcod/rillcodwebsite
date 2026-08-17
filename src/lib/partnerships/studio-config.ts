/**
 * What the proposal studio controls: which pages print, and which photographs.
 *
 * Words are not its job. Headline, opening and closing come from the proposal
 * narrative — house copy, or the one AI pass on the composer. A second editor
 * here used to overlay those fields at render time, so a document could carry
 * a studio headline, a composer opening, and the house close, and read as if
 * two people had written it.
 *
 * `copy` remains on the type so old localStorage and stored configs still parse;
 * `normaliseStudioConfig` drops it, and the template never reads it.
 *
 * Every section defaults to on. A studio that starts empty makes the operator
 * rebuild the document each time; a studio that starts complete lets them remove
 * what a particular school does not need, which is the actual job.
 */

import { PARTNERSHIP_PHOTOS } from './proposal-sections';

export type ProposalSectionKey =
  | 'proofBand'
  | 'intro'
  | 'pitch'
  | 'portfolio'
  | 'journey'
  | 'disciplines'
  | 'rollout'
  | 'comparison'
  | 'zeroCapex'
  | 'caseStudies'
  | 'offers'
  | 'offersChart'
  | 'split'
  | 'upside'
  | 'sideBySide'
  | 'curriculum'
  | 'whyNow'
  | 'fieldProof'
  | 'photos'
  | 'contact';

export type ProposalCopy = {
  headline?: string | null;
  opening?: string | null;
  closing?: string | null;
};

export type ProposalStudioConfig = {
  sections: Record<ProposalSectionKey, boolean>;
  copy: ProposalCopy;
  /** Photographs to print, in order. Empty renders no gallery. */
  photos: string[];
};

export const SECTION_LABELS: Array<{
  key: ProposalSectionKey;
  label: string;
  hint: string;
  page: string;
}> = [
  { key: 'proofBand', label: 'Proof band on the cover', hint: 'Schools, learners and years, counted live', page: 'Cover' },
  { key: 'intro', label: 'Who you would be partnering with', hint: 'One paragraph introducing the company', page: 'Pitch' },
  { key: 'pitch', label: 'Why this, and why now', hint: 'The opening argument and four reasons', page: 'Pitch' },
  { key: 'portfolio', label: 'What a parent gets to hold', hint: 'Read off the portfolio targets in the ladder', page: 'Pitch' },
  { key: 'journey', label: 'What a child walks out with', hint: 'Four stops on the progression', page: 'Programme' },
  { key: 'disciplines', label: 'What a parent can see', hint: 'The six disciplines, as a family would hear them', page: 'Programme' },
  { key: 'rollout', label: 'They see it before you sign', hint: 'Week one for parents, then it is on the timetable', page: 'Programme' },
  { key: 'offers', label: 'The standard options', hint: 'Option A, B1 and B2 as cards', page: 'Fees' },
  { key: 'offersChart', label: 'Option comparison chart', hint: 'What a parent pays per year, compared', page: 'Fees' },
  { key: 'split', label: 'How programme fees would be shared', hint: 'The proposed split, as a bar', page: "The school's share" },
  { key: 'upside', label: 'What this would return to them', hint: 'Illustrated from their roll', page: "The school's share" },
  { key: 'sideBySide', label: 'What each side brings', hint: 'Obligations, side by side', page: 'Fees' },
  { key: 'curriculum', label: 'The year-by-year curriculum', hint: 'Every year, its three terms and its capstone', page: 'Curriculum' },
  { key: 'comparison', label: 'Traditional ICT vs Rillcod', hint: 'Why a board sees the difference', page: 'The case' },
  { key: 'zeroCapex', label: 'Zero-CapEx guarantee', hint: 'What the school never has to buy', page: 'The case' },
  /*
    Named for the switch, not for the history of it.

    This used to print three student builds by age group, and the block was
    dropped: page 3 already lists the same capstones off the curriculum, and one
    of the builds was a competition result printed on page 1 — a proprietor
    reading one project three times does not conclude there are three. The room
    it freed went to the questions a board actually asks, and the switch came
    with it. The key stays `caseStudies` because stored configs and browsers hold
    it; only the words a person reads are corrected.
  */
  { key: 'caseStudies', label: 'Questions we are usually asked', hint: 'Answered on the sheet, not only on the portal', page: 'The case' },
  { key: 'whyNow', label: 'Why now', hint: 'The urgency argument', page: 'Closing' },
  { key: 'fieldProof', label: 'What our students have done', hint: 'Competition wins and builds', page: 'Closing' },
  { key: 'photos', label: 'Photographs of the programme', hint: 'The gallery above the signature', page: 'Closing' },
  { key: 'contact', label: 'Speak to us', hint: 'Our address and phone, inside the reply card', page: 'Closing' },
];

export const ALL_SECTIONS: ProposalSectionKey[] = SECTION_LABELS.map((s) => s.key);

/**
 * The complete document, with the house photographs already chosen.
 *
 * This defaulted to no photographs, and `normaliseStudioConfig` honours an
 * explicit empty array — so the desk, which builds its config from here, sent
 * `photos: []` on every issue and silently overrode the six the document is
 * supposed to print. Every proposal went out with no evidence in it. Starting
 * from the house selection means clearing them is a deliberate act, which is
 * what the studio is for.
 */
export function defaultStudioConfig(
  photos: readonly string[] = PARTNERSHIP_PHOTOS,
): ProposalStudioConfig {
  return {
    sections: Object.fromEntries(ALL_SECTIONS.map((k) => [k, true])) as Record<
      ProposalSectionKey,
      boolean
    >,
    copy: {},
    photos: [...photos],
  };
}

/**
 * Accept whatever arrived and return something the template can trust.
 *
 * The config crosses a network boundary and may come from a stale browser, so
 * an unknown key is dropped and a missing one defaults to on rather than
 * silently removing a section somebody expected to see.
 */
export function normaliseStudioConfig(
  raw: unknown,
  fallbackPhotos: readonly string[] = [],
): ProposalStudioConfig {
  const base = defaultStudioConfig(fallbackPhotos);
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<ProposalStudioConfig>;

  const sections = { ...base.sections };
  if (input.sections && typeof input.sections === 'object') {
    for (const key of ALL_SECTIONS) {
      const value = (input.sections as Record<string, unknown>)[key];
      if (typeof value === 'boolean') sections[key] = value;
    }
  }

  const photos = Array.isArray(input.photos)
    ? input.photos.filter((p): p is string => typeof p === 'string' && p.startsWith('/'))
    : base.photos;

  // Leftover studio copy from a previous session must not overlay the narrative.
  return { sections, copy: {}, photos };
}
