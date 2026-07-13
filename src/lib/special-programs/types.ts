/** Types + helpers for special program marketing/registration pages. */

export type SpecialProgramTrack = {
  id: string;
  icon: string;
  week: string;
  title: string;
  desc: string;
  topics: string[];
};

export type SpecialProgramWeek = {
  num: string;
  tag: string;
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
  curriculum_heading?: string;
  curriculum_intro?: string;
  tracks?: SpecialProgramTrack[];
  weeks?: SpecialProgramWeek[];
};

export type SpecialProgramPage = {
  id: string;
  program_id: string | null;
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
