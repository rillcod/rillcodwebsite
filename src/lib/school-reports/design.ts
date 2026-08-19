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
  /** When true, hide invoice appendices and skip invoice on the publish checklist. */
  excludeBilling?: boolean;
  /** Optional audit note (e.g. pilot school, pro bono term). */
  excludeBillingReason?: string;
}

export const DEFAULT_ACCENT = '#7a0606';

/** Theme-aware analytics palette — uses CSS vars where possible for dark mode. */
export const REPORT_ANALYTICS_COLORS = {
  learners: 'var(--chart-3)',
  classes: 'var(--chart-5)',
  staff: 'var(--chart-1)',
  score: '#10b981',
  attendance: '#14b8a6',
  curriculum: 'var(--primary)',
} as const;

/** Semantic accent colors for report UI segments (charts, rings, panels). */
export const REPORT_SEMANTIC_COLORS = {
  emerald: '#10b981',
  teal: '#14b8a6',
  rose: 'hsl(var(--destructive))',
  brand: 'var(--primary)',
} as const;

export const ACCENT_PRESETS = [
  { label: 'Rillcod red', value: '#7a0606' },
  { label: 'Deep navy', value: '#1e3a5f' },
  { label: 'Forest', value: '#065f46' },
  { label: 'Royal purple', value: '#5b21b6' },
  { label: 'Charcoal', value: '#374151' },
] as const;

/** Maps dark hex accents to high-contrast luminous colors for dark mode text and indicators. */
export const DARK_ACCENT_TEXT_MAP: Record<string, string> = {
  '#7a0606': '#f87171',
  '#1e3a5f': '#60a5fa',
  '#065f46': '#34d399',
  '#5b21b6': '#c084fc',
  '#374151': '#94a3b8',
};

/**
 * Returns a CSS color value or style that ensures high contrast in both light and dark themes.
 */
export function resolveThemeAwareAccent(hexColor: string | undefined): {
  base: string;
  textClass: string;
  borderClass: string;
  bgLightClass: string;
} {
  const norm = String(hexColor || DEFAULT_ACCENT).toLowerCase().trim();
  if (norm === '#7a0606') {
    return {
      base: norm,
      textClass: 'text-[#7a0606] dark:text-red-400',
      borderClass: 'border-[#7a0606]/30 dark:border-red-400/40',
      bgLightClass: 'bg-[#7a0606]/10 dark:bg-red-500/15',
    };
  }
  if (norm === '#1e3a5f') {
    return {
      base: norm,
      textClass: 'text-[#1e3a5f] dark:text-blue-400',
      borderClass: 'border-[#1e3a5f]/30 dark:border-blue-400/40',
      bgLightClass: 'bg-[#1e3a5f]/10 dark:bg-blue-500/15',
    };
  }
  if (norm === '#065f46') {
    return {
      base: norm,
      textClass: 'text-[#065f46] dark:text-emerald-400',
      borderClass: 'border-[#065f46]/30 dark:border-emerald-400/40',
      bgLightClass: 'bg-[#065f46]/10 dark:bg-emerald-500/15',
    };
  }
  if (norm === '#5b21b6') {
    return {
      base: norm,
      textClass: 'text-[#5b21b6] dark:text-purple-400',
      borderClass: 'border-[#5b21b6]/30 dark:border-purple-400/40',
      bgLightClass: 'bg-[#5b21b6]/10 dark:bg-purple-500/15',
    };
  }
  if (norm === '#374151') {
    return {
      base: norm,
      textClass: 'text-[#374151] dark:text-slate-300',
      borderClass: 'border-[#374151]/30 dark:border-slate-400/40',
      bgLightClass: 'bg-[#374151]/10 dark:bg-slate-500/15',
    };
  }
  return {
    base: norm,
    textClass: 'text-primary dark:text-primary',
    borderClass: 'border-primary/30 dark:border-primary/40',
    bgLightClass: 'bg-primary/10 dark:bg-primary/15',
  };
}

export const SECTION_META: Array<{
  key: SchoolReportSectionKey;
  label: string;
  hint: string;
  category: SchoolReportSectionCategory;
}> = [
  { key: 'deliverySummary', label: 'Curriculum delivery', hint: 'Report story, delivery table, and next steps', category: 'body' },
  { key: 'boardBriefing', label: 'Partnership briefing', hint: 'Strengths, excellence, and partnership focus', category: 'body' },
  { key: 'teacherRoster', label: 'Assigned teachers', hint: 'Teachers who served the school this term', category: 'body' },
  { key: 'learnerHighlights', label: 'Learner recognition', hint: 'Highlights and celebration wall', category: 'body' },
  { key: 'communityMessage', label: 'Community message', hint: 'Closing note for families and staff', category: 'body' },
  { key: 'charts', label: 'Performance review', hint: 'Score bands, attendance, and class comparisons', category: 'body' },
  { key: 'nextPhase', label: 'Next phase', hint: 'Roadmap and involvement plan', category: 'body' },
  { key: 'moduleCoverage', label: 'Module coverage', hint: 'Programme module table when delivery summary is off', category: 'body' },
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
  excludeBilling: false,
  excludeBillingReason: '',
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
  const excludeBilling = input?.excludeBilling === true;
  const excludeBillingReason = excludeBilling
    ? String(input?.excludeBillingReason || '').trim().slice(0, 280)
    : '';
  if (excludeBilling) {
    sections.finance = false;
    sections.appendixPayment = false;
  }
  return {
    accentColor,
    density,
    previewDevice,
    showLogo: input?.showLogo !== false,
    headerStyle,
    sections,
    reviewDateNote: String(input?.reviewDateNote || '').trim().slice(0, 280),
    excludeBilling,
    excludeBillingReason,
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
