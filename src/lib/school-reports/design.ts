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
  | 'charts'
  | 'nextPhase';

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

export const SECTION_META: Array<{ key: SchoolReportSectionKey; label: string; hint: string }> = [
  { key: 'deliverySummary', label: 'Delivery summary', hint: 'Planned / delivered / next + evidence ledger' },
  { key: 'boardBriefing', label: 'Board briefing', hint: 'Headline, strengths, partnership focus' },
  { key: 'moduleCoverage', label: 'Module coverage', hint: 'Programme and course week table' },
  { key: 'teacherRoster', label: 'Teacher delivery', hint: 'Who served the school this term' },
  { key: 'learnerHighlights', label: 'Learner highlights', hint: 'Strengths and celebration wall' },
  { key: 'communityMessage', label: 'Community message', hint: 'Newsletter-ready closing paragraph' },
  { key: 'finance', label: 'Finance summary', hint: 'Term invoice block' },
  { key: 'learnerRoster', label: 'Learner roster', hint: 'Full appendix table' },
  { key: 'charts', label: 'Charts & distributions', hint: 'Score bands and comparisons' },
  { key: 'nextPhase', label: 'Next phase roadmap', hint: 'Progressive phases and involvement' },
];

const DEFAULT_SECTIONS = SECTION_META.reduce(
  (acc, row) => {
    acc[row.key] = true;
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
