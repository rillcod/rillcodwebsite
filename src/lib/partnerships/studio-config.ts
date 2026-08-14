/**
 * What the proposal studio controls.
 *
 * The document already renders itself from stored data; this is the layer that
 * decides which of it a given school sees and in whose words. It is deliberately
 * a plain, serialisable object: the studio holds one, the API receives one, and
 * the template reads one, so what is previewed is what is issued.
 *
 * Every section defaults to on. A studio that starts empty makes the operator
 * rebuild the document each time; a studio that starts complete lets them remove
 * what a particular school does not need, which is the actual job.
 */

export type ProposalSectionKey =
  | 'proofBand'
  | 'intro'
  | 'pitch'
  | 'portfolio'
  | 'journey'
  | 'disciplines'
  | 'rollout'
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
  { key: 'disciplines', label: 'What we teach', hint: 'The six disciplines', page: 'Programme' },
  { key: 'rollout', label: 'How a rollout actually goes', hint: 'Week one, week two, every term after', page: 'Programme' },
  { key: 'offers', label: 'The standard options', hint: 'Option A, B1 and B2 as cards', page: 'Fees' },
  { key: 'offersChart', label: 'Option comparison chart', hint: 'What a parent pays per year, compared', page: 'Fees' },
  { key: 'split', label: 'How every fee divides', hint: 'The agreed split, as a bar', page: 'Your return' },
  { key: 'upside', label: 'What this is worth to them', hint: 'Worked from their own roll', page: 'Your return' },
  { key: 'sideBySide', label: 'What each side brings', hint: 'Obligations, side by side', page: 'Your return' },
  { key: 'curriculum', label: 'The year-by-year curriculum', hint: 'Every year, its three terms and its capstone', page: 'Curriculum' },
  { key: 'whyNow', label: 'Why now', hint: 'The urgency argument', page: 'Closing' },
  { key: 'fieldProof', label: 'What our students have done', hint: 'Competition wins and builds', page: 'Closing' },
  { key: 'photos', label: 'Photographs of the programme', hint: 'The gallery above the signature', page: 'Closing' },
  { key: 'contact', label: 'Speak to us', hint: 'The contact block by the signature', page: 'Closing' },
];

export const ALL_SECTIONS: ProposalSectionKey[] = SECTION_LABELS.map((s) => s.key);

export function defaultStudioConfig(photos: readonly string[] = []): ProposalStudioConfig {
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

  const copy: ProposalCopy = {};
  for (const field of ['headline', 'opening', 'closing'] as const) {
    const value = input.copy?.[field];
    if (typeof value === 'string' && value.trim()) copy[field] = value.trim();
  }

  const photos = Array.isArray(input.photos)
    ? input.photos.filter((p): p is string => typeof p === 'string' && p.startsWith('/'))
    : base.photos;

  return { sections, copy, photos };
}
