/** Types + helpers for special program marketing/registration pages. */

export type SpecialProgramTrack = {
  id: string;
  icon: string;
  week: string;
  title: string;
  desc: string;
  topics: string[];
  /** Override page default — how many class sessions run in each calendar week. */
  sessions_per_week?: number;
};

export type SpecialProgramWeek = {
  num: string;
  tag: string;
  title: string;
  desc: string;
};

export type SpecialProgramBonusItem = {
  label: string;
  desc: string;
};

export type SpecialProgramBonus = {
  enabled?: boolean;
  badge?: string;
  icon?: string;
  title?: string;
  desc?: string;
  items?: SpecialProgramBonusItem[];
};

export type SpecialProgramOutcome = {
  icon: string;
  title: string;
  desc: string;
};

export type SpecialProgramContent = {
  hero_blurb?: string;
  season_badge?: string;
  title_line1?: string;
  title_line2?: string;
  ages_label?: string;
  age_min?: number;
  age_max?: number;
  duration_label?: string;
  /** Default class meetings per calendar week (1–7). Tracks may override. */
  sessions_per_week?: number;
  curriculum_heading?: string;
  curriculum_intro?: string;
  tracks?: SpecialProgramTrack[];
  weeks?: SpecialProgramWeek[];
  weeks_heading?: string;
  weeks_intro?: string;
  bonus?: SpecialProgramBonus;
  outcomes_heading?: string;
  outcomes_intro?: string;
  outcomes?: SpecialProgramOutcome[];
  register_heading?: string;
  next_path_heading?: string;
  next_path_intro?: string;
};

/** Clamp sessions/week to a teachable range. */
export function clampSessionsPerWeek(raw: unknown, fallback = 1): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(7, Math.floor(n)));
}

/** Track override wins; otherwise page default; otherwise 1. */
export function resolveSessionsPerWeek(
  track: { sessions_per_week?: number } | null | undefined,
  page: { sessions_per_week?: number } | null | undefined,
): number {
  if (track?.sessions_per_week != null) {
    return clampSessionsPerWeek(track.sessions_per_week, 1);
  }
  return clampSessionsPerWeek(page?.sessions_per_week, 1);
}

/** Hardcoded fallbacks used when content fields are missing (legacy pages). */
export const DEFAULT_SPECIAL_BONUS: Required<Pick<SpecialProgramBonus, 'enabled' | 'badge' | 'icon' | 'title' | 'desc'>> & {
  items: SpecialProgramBonusItem[];
} = {
  enabled: true,
  badge: 'Included Free Bonus Track',
  icon: '🎬',
  title: 'AI Video Ads & Product Creation',
  desc: 'Go beyond coding. Students learn how to build digital products, produce professional commercial-quality video advertisements using AI, script with LLMs, and synthesize AI voiceovers.',
  items: [
    { label: 'AI Video Editing', desc: 'Producing visual media and dynamic sequences' },
    { label: 'Voice Synthesis', desc: 'Generating scripts and digital voice models' },
    { label: 'Digital Entrepreneur', desc: 'Designing landing pages and launching projects' },
  ],
};

export const DEFAULT_SPECIAL_OUTCOMES: SpecialProgramOutcome[] = [
  { icon: '🖼️', title: 'AI Art Portfolio', desc: 'A collection of generated consistent character storylines' },
  { icon: '💬', title: 'Live Chatbot Web App', desc: 'A working Python/JS chatbot program powered by Gemini' },
  { icon: '🎮', title: 'Playable AI Game', desc: 'A self-coded Pygame featuring intelligent pathfinding' },
  { icon: '📣', title: 'Video Ad Campaign', desc: 'A commercial video ad demonstrating their tech project' },
  { icon: '🏆', title: 'Academy Certificate', desc: 'Official credentials of graduation from Rillcod' },
  { icon: '🚀', title: 'Entrepreneur Mindset', desc: 'Experience taking a project from design to web launch' },
];

export const DEFAULT_WEEKS_HEADING = 'Weekly Curriculum';
export const DEFAULT_WEEKS_INTRO = 'A detailed schedule showing our student learning progression over the cohort.';
export const DEFAULT_OUTCOMES_HEADING = 'Expected Outcomes';
export const DEFAULT_OUTCOMES_INTRO = 'What your child will create and take home upon graduating from the program.';
export const DEFAULT_REGISTER_HEADING = 'Registration Form';
export const DEFAULT_NEXT_PATH_HEADING = 'After this cohort';
export const DEFAULT_NEXT_PATH_INTRO =
  'Kids, teens, adults, and individual learners are all welcome. We help you continue into Young Innovators or Teen Developers (school-age), or specialist tracks for older teens and adults.';

export function resolveSpecialBonus(content: SpecialProgramContent | null | undefined): SpecialProgramBonus & {
  enabled: boolean;
  badge: string;
  icon: string;
  title: string;
  desc: string;
  items: SpecialProgramBonusItem[];
} {
  const b = content?.bonus;
  return {
    enabled: b?.enabled !== false,
    badge: (b?.badge || '').trim() || DEFAULT_SPECIAL_BONUS.badge,
    icon: (b?.icon || '').trim() || DEFAULT_SPECIAL_BONUS.icon,
    title: (b?.title || '').trim() || DEFAULT_SPECIAL_BONUS.title,
    desc: (b?.desc || '').trim() || DEFAULT_SPECIAL_BONUS.desc,
    items: Array.isArray(b?.items) && b!.items!.length ? b!.items! : DEFAULT_SPECIAL_BONUS.items,
  };
}

export function resolveSpecialOutcomes(content: SpecialProgramContent | null | undefined): SpecialProgramOutcome[] {
  const list = content?.outcomes;
  if (Array.isArray(list) && list.length) return list;
  return DEFAULT_SPECIAL_OUTCOMES;
}

export type SpecialProgramPage = {
  id: string;
  program_id: string | null;
  /** Linked offering — set by sync after save. */
  academic_offering_id?: string | null;
  /** School on the linked offering (where teaching sits). */
  school_id?: string | null;
  /** Last teaching prep result for admins. */
  teaching_launch?: {
    status: 'running' | 'ok' | 'error';
    at: string;
    error?: string;
    detail?: string;
    built?: number;
    skipped?: number;
    failed?: number;
    weeks_started?: number;
  } | null;
  /** Active (or best) cohort class on the linked offering. */
  cohort_class?: {
    id: string;
    name: string;
    status: string;
    teacher_id: string | null;
    teacher_name: string | null;
  } | null;
  /** Classes already on this offering. */
  offering_classes?: Array<{
    id: string;
    name: string;
    status: string;
    teacher_id: string | null;
    teacher_name: string | null;
  }>;
  /** School classes that can be linked as the cohort. */
  linkable_classes?: Array<{
    id: string;
    name: string;
    status: string;
    teacher_id: string | null;
    teacher_name: string | null;
  }>;
  /** Checklist for prepare-teaching / Approvals. */
  teaching_readiness?: {
    ready: boolean;
    can_prepare: boolean;
    missing: string[];
    steps: Array<{
      id: string;
      label: string;
      ok: boolean;
      detail: string;
    }>;
  };
  slug: string;
  title: string;
  button_label: string;
  is_published: boolean;
  is_featured: boolean;
  starts_on: string | null;
  ends_on: string | null;
  registration_deadline: string | null;
  online_fee: number;
  onsite_fee: number;
  deposit_percent: number;
  content: SpecialProgramContent;
  created_at?: string;
  updated_at?: string;
};

export function slugifySpecialProgram(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'special-program';
}

export function specialProgramPublicPath(slug: string): string {
  return `/special/${slug}`;
}

export function formatSpecialDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function isRegistrationOpen(page: Pick<SpecialProgramPage, 'registration_deadline' | 'is_published'>): boolean {
  if (!page.is_published) return false;
  if (!page.registration_deadline) return true;
  const end = new Date(`${page.registration_deadline}T23:59:59`);
  return Date.now() <= end.getTime();
}

/**
 * Whether a special programme still deserves the front of the site.
 *
 * `isRegistrationOpen` answers "can somebody still sign up". This answers the
 * different question "should we still be shouting about it" — and the site only
 * ever asked the first one, so a finished intake kept its banner in the nav, its
 * card over the hero, its popup and its WhatsApp opener until somebody manually
 * unpublished it. A visitor reads a closed summer school on the homepage as a
 * dead site, not a busy one.
 *
 * A programme is promotable while registration is open AND its final day has not
 * passed. The dates are plain ISO days, so both are read to the end of the day
 * they name.
 */
export function isPromotable(
  page: Pick<SpecialProgramPage, 'registration_deadline' | 'is_published' | 'ends_on'>,
): boolean {
  if (!isRegistrationOpen(page)) return false;
  if (page.ends_on) {
    const finished = new Date(`${page.ends_on}T23:59:59`);
    if (!Number.isNaN(finished.getTime()) && Date.now() > finished.getTime()) return false;
  }
  return true;
}

export function getSpecialTotalTuition(
  page: Pick<SpecialProgramPage, 'online_fee' | 'onsite_fee'>,
  preferredMode: string,
): number {
  if (preferredMode === 'Onsite') return Number(page.onsite_fee) || 0;
  return Number(page.online_fee) || 0;
}

export function getSpecialDepositAmount(
  page: Pick<SpecialProgramPage, 'online_fee' | 'onsite_fee' | 'deposit_percent'>,
  preferredMode: string,
): number {
  const total = getSpecialTotalTuition(page, preferredMode);
  const pct = Number(page.deposit_percent) || 50;
  return Math.round((total * pct) / 100);
}

export function getSpecialTuitionAmount(
  page: Pick<SpecialProgramPage, 'online_fee' | 'onsite_fee' | 'deposit_percent'>,
  preferredMode: string,
  paymentPlan: string,
): number {
  if (paymentPlan === 'installment') return getSpecialDepositAmount(page, preferredMode);
  return getSpecialTotalTuition(page, preferredMode);
}

export function specialTuitionLabels(
  page: Pick<SpecialProgramPage, 'online_fee' | 'onsite_fee' | 'deposit_percent'>,
  preferredMode: string,
) {
  const isOnsite = preferredMode === 'Onsite';
  const total = getSpecialTotalTuition(page, preferredMode);
  const deposit = getSpecialDepositAmount(page, preferredMode);
  const fmt = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  const short = (n: number) => {
    if (n >= 1000 && n % 1000 === 0) return `₦${n / 1000}k`;
    return fmt(n);
  };
  return {
    total: fmt(total),
    deposit: fmt(deposit),
    fullShort: `Full (${short(total)})`,
    splitShort: `Split (${short(deposit)})`,
    isOnsite,
  };
}

export function normalizeSpecialContent(raw: unknown): SpecialProgramContent {
  if (!raw || typeof raw !== 'object') return {};
  return raw as SpecialProgramContent;
}

export function mapSpecialProgramRow(row: any): SpecialProgramPage {
  return {
    id: row.id,
    program_id: row.program_id ?? null,
    slug: row.slug,
    title: row.title,
    button_label: row.button_label || row.title,
    is_published: Boolean(row.is_published),
    is_featured: Boolean(row.is_featured),
    starts_on: row.starts_on ?? null,
    ends_on: row.ends_on ?? null,
    registration_deadline: row.registration_deadline ?? null,
    online_fee: Number(row.online_fee) || 0,
    onsite_fee: Number(row.onsite_fee) || 0,
    deposit_percent: Number(row.deposit_percent) || 50,
    content: normalizeSpecialContent(row.content),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
