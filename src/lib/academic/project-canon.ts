/**
 * Prefer the authored project brief; ask the AI only for the gaps.
 *
 * Two systems produce projects for a class and they were never reconciled. The
 * weekly sweep asks the AI to invent one per class per week. The progression
 * layer draws on curriculum_project_registry — 21,354 authored slots that have
 * never once been used. Choosing between them permanently is the wrong call:
 * the canon is better where it exists, and does not exist everywhere.
 *
 * So the canon wins when it is real, and the AI covers the rest. That is the
 * same rule content-reuse.ts already applies to lessons — use what exists,
 * generate only what does not — and it has the same property: nothing breaks
 * when the canon is absent, because absence is the normal case today.
 *
 * The quality bar is what makes this safe to switch on now. 20,520 of those
 * rows still hold a placeholder — "Build, test, and present practical output
 * for week N using Cross Track concepts", 71 characters, the same sentence
 * across fifty-nine weeks. A brief like that is worse than what the AI writes,
 * so it is ignored until somebody rewrites it. Rewrite a shape and every slot
 * sharing it starts winning automatically. There is no flag to flip and no
 * migration between the two states: the catalogue takes over exactly as fast
 * as it earns the right to.
 */

/** Below this a brief is a placeholder, not a project. See the note above. */
export const SUBSTANTIVE_BRIEF_CHARS = 120;

export type RegistryBrief = {
  id: string;
  title: string | null;
  classwork_prompt: string | null;
  estimated_minutes: number | null;
  concept_tags: string[] | null;
  difficulty_level: number | null;
};

export type CanonDecision =
  | { source: 'canon'; templateId: string; title: string; brief: string; minutes: number | null }
  | { source: 'ai'; reason: 'no_match' | 'placeholder_only' };

/**
 * The house frame for a project, handed to the model rather than used instead
 * of it.
 *
 * The first version of this replaced the generated project outright, and that
 * was wrong in a way only reading the output showed. One brief served 9,720
 * slots, so it could not name the tool, could not use the week's actual topic,
 * and was pitched at no particular age — a Basic 1 pupil got the same sentence
 * as SS 3. The model it displaced was worse-written but better-informed,
 * because it reads the syllabus week.
 *
 * The registry knows things the model cannot: the shape a Rillcod project takes,
 * how long it should run, how hard it should be. The model knows the thing the
 * registry cannot: what this week is actually about. So the brief becomes the
 * frame and the model fills it, and neither is asked to do the other's job.
 *
 * The 120-character bar still applies. A one-line placeholder is not a frame.
 */
export type ProjectFrame = {
  templateId: string;
  /** The authored brief, with {week} and {track} already filled. */
  frame: string;
  minutes: number | null;
  difficulty: number | null;
};

export function frameFor(decision: CanonDecision, difficulty?: number | null): ProjectFrame | null {
  if (decision.source !== 'canon') return null;
  return {
    templateId: decision.templateId,
    frame: decision.brief,
    minutes: decision.minutes,
    difficulty: difficulty ?? null,
  };
}

/**
 * Whether a registry row is worth using instead of generating.
 *
 * Length is a blunt test and deliberately so: the placeholders are uniformly
 * short and uniformly templated, and any real brief clears the bar without
 * anyone having to grade it. A cleverer measure would be one more thing to get
 * wrong for no additional protection.
 */
export function isSubstantive(brief: RegistryBrief | null | undefined): boolean {
  const prompt = brief?.classwork_prompt?.trim() ?? '';
  return prompt.length >= SUBSTANTIVE_BRIEF_CHARS;
}

/**
 * Fill {week}, {track} and {title} so one authored brief stays specific to the
 * slot it is being used in. Unknown placeholders are left alone rather than
 * blanked — a brief that reads "{topic}" is visibly wrong, where a brief with a
 * hole in it silently is.
 */
export function fillBrief(
  brief: string,
  slot: { week?: number | null; track?: string | null; title?: string | null }
): string {
  return brief
    .replace(/\{week\}/g, slot.week != null ? String(slot.week) : '')
    .replace(/\{track\}/g, slot.track ?? '')
    .replace(/\{title\}/g, slot.title ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Choose between the canon and the AI for one week of one class.
 *
 * Candidates are whatever the caller found for this track and week; this only
 * decides. Kept pure so the rule is testable without a database, in the same
 * way decideReuse is.
 */
export function decideProjectSource(
  candidates: readonly RegistryBrief[] | null | undefined,
  slot: { week?: number | null; track?: string | null }
): CanonDecision {
  const rows = candidates ?? [];
  if (rows.length === 0) return { source: 'ai', reason: 'no_match' };

  // Richest brief first: where several slots match, the most written-out one is
  // the one somebody actually worked on.
  const best = rows
    .filter(isSubstantive)
    .sort(
      (a, b) =>
        (b.classwork_prompt?.length ?? 0) - (a.classwork_prompt?.length ?? 0)
    )[0];

  if (!best) return { source: 'ai', reason: 'placeholder_only' };

  return {
    source: 'canon',
    templateId: best.id,
    title: best.title?.trim() || `Week ${slot.week ?? ''} Project`.trim(),
    brief: fillBrief(best.classwork_prompt ?? '', { ...slot, title: best.title }),
    minutes: best.estimated_minutes ?? null,
  };
}
