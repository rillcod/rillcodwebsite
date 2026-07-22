export type SchoolReportPreviewDevice = 'mobile' | 'tablet' | 'desktop';

export type SchoolReportSectionKey =
  | 'deliverySummary'
  | 'boardBriefing'
  | 'moduleCoverage'
  | 'teacherRoster'
  | 'learnerHighlights'
  | 'communityMessage'
  | 'finance'
  | 'learnerRoster'
  | 'appendixGradebook'
  | 'appendixPayment'
  | 'charts'
  | 'nextPhase';

export type SchoolReportSectionCategory = 'body' | 'appendix';

export type SchoolReportDensity = 'compact' | 'comfortable' | 'spacious';

export type SchoolReportHeaderStyle = 'classic' | 'minimal';

export interface SchoolReportDesignSettings {
  accentColor: string;
  density: SchoolReportDensity;
  previewDevice: SchoolReportPreviewDevice;
  showLogo: boolean;
  headerStyle: SchoolReportHeaderStyle;
  sections: Record<SchoolReportSectionKey, boolean>;
  reviewDateNote: string;
}

export const DEFAULT_ACCENT = '#7a0606';

export const ACCENT_PRESETS = [
  { label: 'Rillcod red', value: '#7a0606' },
  { label: 'Deep navy', value: '#1e3a5f' },
  { label: 'Forest', value: '#065f46' },
  { label: 'Royal purple', value: '#5b21b6' },
  { label: 'Charcoal', value: '#374151' },
] as const;

export const SECTION_META: Array<{
  key: SchoolReportSectionKey;
  label: string;
  hint: string;
  category: SchoolReportSectionCategory;
}> = [
  { key: 'deliverySummary', label: 'A-B Curriculum delivery', hint: 'What we taught, programme table, evidence and next steps', category: 'body' },
  { key: 'boardBriefing', label: 'F Partnership briefing', hint: 'Strengths, excellence and partnership focus', category: 'body' },
  { key: 'teacherRoster', label: 'Teacher delivery', hint: 'Who served the school this term', category: 'body' },
  { key: 'learnerHighlights', label: 'C-D Learner recognition', hint: 'Learner highlights and celebration wall', category: 'body' },
  { key: 'communityMessage', label: 'Community message', hint: 'Newsletter-ready closing paragraph', category: 'body' },
  { key: 'charts', label: 'Performance review', hint: 'Score bands and class comparisons', category: 'body' },
  { key: 'nextPhase', label: 'Next phase roadmap', hint: 'Progressive phases and involvement', category: 'body' },
  { key: 'moduleCoverage', label: 'Module coverage (legacy)', hint: 'Hidden programme module table when delivery summary is off', category: 'body' },
  { key: 'learnerRoster', label: 'Appendix A — Learner roster', hint: 'Exam scores, attendance and status by class', category: 'appendix' },
  { key: 'finance', label: 'Appendix B — School invoice', hint: 'Invoice totals, line items and payment instructions', category: 'appendix' },
  { key: 'appendixGradebook', label: 'Appendix C — Classwork, assignments and assessment', hint: 'Published component scores per learner', category: 'appendix' },
  { key: 'appendixPayment', label: 'Appendix D — Payment confirmation', hint: 'Recorded payments when the school has paid (requires payment data)', category: 'appendix' },
];

export const BODY_SECTION_META = SECTION_META.filter((row) => row.category === 'body');
export const APPENDIX_SECTION_META = SECTION_META.filter((row) => row.category === 'appendix');

export const APPENDIX_SECTION_KEYS = [
  { key: 'learnerRoster' as const, letter: 'A', label: 'Learner roster' },
  { key: 'finance' as const, letter: 'B', label: 'School invoice' },
  { key: 'appendixGradebook' as const, letter: 'C', label: 'Classwork, assignments and assessment' },
  { key: 'appendixPayment' as const, letter: 'D', label: 'Payment confirmation' },
];

const DEFAULT_SECTIONS = SECTION_META.reduce(
  (acc, row) => {
    acc[row.key] = row.key !== 'boardBriefing' && row.key !== 'nextPhase' && row.key !== 'moduleCoverage';
    return acc;
  },
  {} as Record<SchoolReportSectionKey, boolean>,
);

export const DEFAULT_SCHOOL_REPORT_DESIGN: SchoolReportDesignSettings = {
  accentColor: DEFAULT_ACCENT,
  density: 'comfortable',
  previewDevice: 'desktop',
  showLogo: true,
  headerStyle: 'classic',
  sections: { ...DEFAULT_SECTIONS },
  reviewDateNote: '',
};

export function normalizeSchoolReportDesign(
  input: Partial<SchoolReportDesignSettings> | null | undefined,
): SchoolReportDesignSettings {
  const sections = { ...DEFAULT_SECTIONS };
  if (input?.sections && typeof input.sections === 'object') {
    for (const row of SECTION_META) {
      if (typeof input.sections[row.key] === 'boolean') {
        sections[row.key] = input.sections[row.key]!;
      }
    }
  }
  const accent = String(input?.accentColor || DEFAULT_ACCENT).trim();
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : DEFAULT_ACCENT;
  const density =
    input?.density === 'compact' || input?.density === 'spacious' ? input.density : 'comfortable';
  const previewDevice =
    input?.previewDevice === 'mobile' || input?.previewDevice === 'tablet'
      ? input.previewDevice
      : 'desktop';
  const headerStyle = input?.headerStyle === 'minimal' ? 'minimal' : 'classic';
  return {
    accentColor,
    density,
    previewDevice,
    showLogo: input?.showLogo !== false,
    headerStyle,
    sections,
    reviewDateNote: String(input?.reviewDateNote || '').trim().slice(0, 280),
  };
}

export function designStatesEqual(a: SchoolReportDesignSettings, b: SchoolReportDesignSettings): boolean {
  return JSON.stringify(normalizeSchoolReportDesign(a)) === JSON.stringify(normalizeSchoolReportDesign(b));
}

export function previewDeviceWidth(device: SchoolReportPreviewDevice): number {
  if (device === 'mobile') return 390;
  if (device === 'tablet') return 768;
  return 960;
}

export function densityClasses(density: SchoolReportDensity): {
  page: string;
  section: string;
  text: string;
  heading: string;
} {
  if (density === 'compact') {
    return {
      page: 'p-3 gap-3',
      section: 'space-y-2',
      text: 'text-[11px] leading-5',
      heading: 'text-xs',
    };
  }
  if (density === 'spacious') {
    return {
      page: 'p-6 gap-6',
      section: 'space-y-5',
      text: 'text-sm leading-7',
      heading: 'text-base',
    };
  }
  return {
    page: 'p-4 gap-4',
    section: 'space-y-3',
    text: 'text-xs leading-6',
    heading: 'text-sm',
  };
}

export function showReportSection(
  design: SchoolReportDesignSettings | null | undefined,
  key: SchoolReportSectionKey,
): boolean {
  const normalized = normalizeSchoolReportDesign(design);
  return normalized.sections[key] !== false;
}

/** Human-readable list of appendices included in the published PDF. */
export function describeEnabledAppendices(design: SchoolReportDesignSettings | null | undefined): string {
  const enabled = APPENDIX_SECTION_KEYS.filter((row) => showReportSection(design, row.key));
  if (!enabled.length) {
    return 'No detachable appendices are included in this book.';
  }
  const labels = enabled.map((row) => `Appendix ${row.letter}`).join(', ');
  return `Detachable appendices included: ${labels}.`;
}
