/**
 * Reading the published curriculum progression.
 *
 * The twelve-year ladder is stored as an edition (see migration
 * 20260929000064). A proposal quotes it, a school will be shown it, and it is
 * meant to drive teaching later — so every reader goes through here and gets the
 * one published edition, never a draft that happens to be lying around.
 */

/** The default ladder: Basic 1 through SS 3, AI-integrated coding and robotics. */
export const DEFAULT_PROGRESSION_SLUG = 'k12-ai-coding';

export type ProgressionTerm = {
  term: number;
  focus: string;
};

export type ProgressionLevel = {
  year_number: number;
  grade: string;
  theme: string;
  terms: ProgressionTerm[];
  capstone: string | null;
  portfolio: string | null;
};

export type CurriculumProgression = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  edition: number;
  status: string;
  levels: ProgressionLevel[];
};

function toTerms(raw: unknown): ProgressionTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({ term: Number(t.term) || 0, focus: String(t.focus ?? '') }))
    .sort((a, b) => a.term - b.term);
}

/**
 * The published edition, with its years in teaching order.
 *
 * Returns null rather than throwing: a proposal without the ladder is thinner,
 * not invalid, and a missing progression must not stop a school being quoted.
 */
export async function getPublishedProgression(
  db: { from: (t: string) => any },
  slug: string = DEFAULT_PROGRESSION_SLUG,
): Promise<CurriculumProgression | null> {
  const { data: progression } = await db
    .from('curriculum_progressions')
    .select('id, slug, title, subtitle, summary, edition, status')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (!progression?.id) return null;

  const { data: levels } = await db
    .from('curriculum_progression_levels')
    .select('year_number, grade, theme, terms, capstone, portfolio')
    .eq('progression_id', progression.id)
    .order('year_number', { ascending: true });

  return {
    id: String(progression.id),
    slug: String(progression.slug),
    title: String(progression.title),
    subtitle: progression.subtitle ?? null,
    summary: progression.summary ?? null,
    edition: Number(progression.edition) || 1,
    status: String(progression.status),
    levels: (levels ?? []).map((l: Record<string, unknown>) => ({
      year_number: Number(l.year_number) || 0,
      grade: String(l.grade),
      theme: String(l.theme),
      terms: toTerms(l.terms),
      capstone: (l.capstone as string) ?? null,
      portfolio: (l.portfolio as string) ?? null,
    })),
  };
}

/**
 * Split the ladder the way a school reads it — primary and secondary.
 *
 * The proposal prints these as two separate pages because a head teacher looks
 * at one half or the other, not the twelve years at once.
 */
export function splitByStage(levels: ProgressionLevel[]): {
  primary: ProgressionLevel[];
  secondary: ProgressionLevel[];
} {
  const isPrimary = (g: string) => /^(Nursery|Basic)/i.test(g);
  return {
    primary: levels.filter((l) => isPrimary(l.grade)),
    secondary: levels.filter((l) => !isPrimary(l.grade)),
  };
}

/** Which half of the ladder a quote covers. */
export type CurriculumStage = 'primary' | 'secondary' | 'both';

/**
 * Trim the ladder to one stage.
 *
 * A primary school has no use for the SS years and a secondary school does not
 * want to read about Basic 1 — quoting the whole twelve to either is how a
 * proposal reads as a template rather than an answer.
 */
export function levelsForStage(
  levels: ProgressionLevel[],
  stage: CurriculumStage | null | undefined,
): ProgressionLevel[] {
  if (!stage || stage === 'both') return levels;
  const { primary, secondary } = splitByStage(levels);
  return stage === 'primary' ? primary : secondary;
}

/** The years a given offer actually covers, so a quote does not promise more than it sells. */
export function levelsForScope(levels: ProgressionLevel[], scope: string): ProgressionLevel[] {
  // "Basic 1 through SS 2" — an offer that stops short of the final year.
  const stopsAt = scope.match(/through\s+(Nursery|Basic|JSS|SS)\s*(\d)/i);
  if (!stopsAt) return levels;

  const order = ['Nursery', 'Basic', 'JSS', 'SS'];
  const lastLevel = order.indexOf(
    stopsAt[1].toUpperCase() === 'SS' ? 'SS' : stopsAt[1].replace(/^(\w)(\w*)$/, (_, a, b) => a.toUpperCase() + b.toLowerCase()),
  );
  const lastNumber = Number(stopsAt[2]);

  return levels.filter((l) => {
    const m = l.grade.match(/^(Nursery|Basic|JSS|SS)\s*(\d)$/i);
    if (!m) return true;
    const idx = order.findIndex((o) => o.toLowerCase() === m[1].toLowerCase());
    const n = Number(m[2]);
    if (idx < lastLevel) return true;
    if (idx > lastLevel) return false;
    return n <= lastNumber;
  });
}
