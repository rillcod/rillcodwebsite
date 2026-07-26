import { geminiGenerateText } from '@/lib/gemini/client';
import { syntheticWeekTopicLabel } from './topics-covered-presentation';

/**
 * Expand a course's real topic bank into a week-by-week delivery plan for the
 * reporting window, so staff tick against genuine teaching content.
 *
 * Before this existed, "generate on the spot" wrote a hardcoded template: a
 * four-item phrase list cycled by week number, identical for every course in
 * every school. Staff were ticking "Week 5: Core concepts & guided practice"
 * for both Robotics and Web Design, which makes "tick what was truly delivered"
 * impossible to do honestly.
 *
 * Every result carries its `source`. A placeholder expansion must never be
 * presented as though a human or a model authored it.
 */

export type ExpandedWeek = {
  week: number;
  topic: string;
  weekType: 'lesson' | 'assessment';
  objectives: string[];
};

export type WeekExpansion = {
  weeks: ExpandedWeek[];
  source: 'ai' | 'placeholder';
  model: string | null;
};

export type ExpandCourseWeeksInput = {
  courseTitle: string;
  programme: string;
  schoolName?: string | null;
  termLabel?: string | null;
  termNumber: number;
  /** The exact weeks this report covers, e.g. [1..10]. */
  weekNumbers: number[];
  /** Topics genuinely reached for this course — the bank we expand from. */
  reachedTopics?: string[];
};

const MAX_OBJECTIVES = 3;
const TOPIC_MAX_CHARS = 120;

/** Deterministic fallback. Always labelled `placeholder` so callers can refuse to publish it. */
export function placeholderExpansion(courseTitle: string, weekNumbers: number[]): WeekExpansion {
  return {
    weeks: weekNumbers.map((week) => ({
      week,
      topic: syntheticWeekTopicLabel(courseTitle, week),
      weekType: week % 4 === 0 ? 'assessment' : 'lesson',
      objectives: [],
    })),
    source: 'placeholder',
    model: null,
  };
}

function coerceWeekType(value: unknown, week: number): 'lesson' | 'assessment' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'assessment' || raw === 'lesson') return raw;
  return week % 4 === 0 ? 'assessment' : 'lesson';
}

function coerceObjectives(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_OBJECTIVES);
}

function coerceTopic(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, TOPIC_MAX_CHARS);
}

/**
 * Normalise a model response into exactly one entry per requested week.
 * Exported for tests: the parsing is where a model response can quietly go wrong,
 * and a half-filled plan is worse than an honest placeholder.
 */
/**
 * Parse whatever weeks a response actually contains, keyed by week number.
 * Says nothing about completeness — that is the caller's decision, which is what
 * lets a second response top up the first instead of replacing it.
 */
export function collectWeeks(parsed: unknown): Map<number, ExpandedWeek> {
  const byWeek = new Map<number, ExpandedWeek>();
  const rows = Array.isArray((parsed as { weeks?: unknown })?.weeks)
    ? ((parsed as { weeks: unknown[] }).weeks)
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;
  if (!rows) return byWeek;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const week = Number(record.week ?? record.week_number);
    if (!Number.isFinite(week)) continue;
    const topic = coerceTopic(record.topic ?? record.title);
    if (!topic) continue;
    byWeek.set(week, {
      week,
      topic,
      weekType: coerceWeekType(record.weekType ?? record.type, week),
      objectives: coerceObjectives(record.objectives),
    });
  }
  return byWeek;
}

export function normaliseExpansion(
  parsed: unknown,
  input: Pick<ExpandCourseWeeksInput, 'courseTitle' | 'weekNumbers'>,
): ExpandedWeek[] | null {
  const byWeek = collectWeeks(parsed);

  // Partial coverage is rejected outright rather than silently padded, so a
  // half-answered model response cannot masquerade as a complete plan.
  const covered = input.weekNumbers.filter((week) => byWeek.has(week));
  if (covered.length !== input.weekNumbers.length) return null;

  return input.weekNumbers.map((week) => byWeek.get(week)!);
}

function buildSystemPrompt(weekCount: number): string {
  return [
    'You plan week-by-week delivery for a STEM and computer-science provider working with Nigerian schools.',
    'You produce a teaching plan a Head of School would recognise as real: concrete, sequential, and specific to the named course.',
    'Rules:',
    `- Return EXACTLY ${weekCount} objects, one for every week number in weeksToPlan. Do not skip any. Do not add any.`,
    '- Topics must be specific to the course. Never emit generic filler such as "Core concepts & guided practice" or "Week N Lab".',
    '- Build a sensible progression: foundations first, then application, then consolidation.',
    '- When existing covered topics are supplied, continue and deepen that sequence — do not restate it verbatim.',
    '- Mark roughly every fourth week as an assessment week.',
    '- Objectives: AT MOST 2 per week, each under 12 words. Brevity matters more than detail.',
    '- Use plain English suitable for Nigerian school leadership. No marketing language.',
    'Return JSON: { "weeks": [ { "week": number, "topic": string, "weekType": "lesson" | "assessment", "objectives": string[] } ] }',
  ].join('\n');
}

/** One model round-trip for a specific set of weeks. Returns whatever parsed cleanly. */
async function requestWeeks(
  input: ExpandCourseWeeksInput,
  weekNumbers: number[],
  reached: string[],
  /** Weeks already planned in this same term, so a gap-fill fits its neighbours. */
  alreadyPlanned?: Map<number, ExpandedWeek>,
): Promise<{ byWeek: Map<number, ExpandedWeek>; model: string | null }> {
  // Without this the repair pass plans a missing week blind, and it lands out of
  // sequence — a chassis-assembly week appearing after the autonomous-robot
  // project it was supposed to precede.
  const surroundingWeeks = alreadyPlanned?.size
    ? [...alreadyPlanned.values()]
        .sort((a, b) => a.week - b.week)
        .map((row) => ({ week: row.week, topic: row.topic }))
    : undefined;

  const userPrompt = JSON.stringify({
    course: input.courseTitle,
    programme: input.programme,
    school: input.schoolName ?? null,
    term: input.termLabel ?? `Term ${input.termNumber}`,
    termNumber: input.termNumber,
    weeksToPlan: weekNumbers,
    weekCount: weekNumbers.length,
    topicsAlreadyCovered: reached,
    ...(surroundingWeeks
      ? {
          alreadyPlannedThisTerm: surroundingWeeks,
          instruction: 'Fill ONLY the weeks in weeksToPlan. They must fit sequentially between the alreadyPlannedThisTerm weeks around them, and must not repeat those topics.',
        }
      : {}),
  });

  const result = await geminiGenerateText(buildSystemPrompt(weekNumbers.length), userPrompt, true);
  if (!result?.text) return { byWeek: new Map(), model: null };

  const rows = collectWeeks(JSON.parse(result.text) as unknown);
  return { byWeek: rows, model: result.model };
}

export async function expandCourseDeliveryWeeks(input: ExpandCourseWeeksInput): Promise<WeekExpansion> {
  const weekNumbers = [...new Set(input.weekNumbers.filter((week) => Number.isFinite(week)))].sort((a, b) => a - b);
  if (!weekNumbers.length) return { weeks: [], source: 'placeholder', model: null };

  const reached = (input.reachedTopics ?? []).map((topic) => String(topic).trim()).filter(Boolean).slice(0, 60);

  try {
    const first = await requestWeeks(input, weekNumbers, reached);
    const collected = first.byWeek;
    let model = first.model;

    // Models routinely return one or two weeks short of a long request — a
    // 10-week plan commonly comes back with 9. Padding the gap would invent a
    // week nobody planned, and rejecting outright made the feature fall back to
    // boilerplate almost every time. So ask again for ONLY the missing weeks and
    // merge. One repair attempt, never a loop.
    const missing = weekNumbers.filter((week) => !collected.has(week));
    if (missing.length && missing.length < weekNumbers.length) {
      try {
        const repair = await requestWeeks(input, missing, reached, collected);
        for (const [week, row] of repair.byWeek) {
          if (weekNumbers.includes(week)) collected.set(week, row);
        }
        model = model ?? repair.model;
      } catch {
        // Repair is best-effort; the completeness check below still decides.
      }
    }

    const complete = weekNumbers.every((week) => collected.has(week));
    if (!complete) return placeholderExpansion(input.courseTitle, weekNumbers);

    return {
      weeks: weekNumbers.map((week) => collected.get(week)!),
      source: 'ai',
      model,
    };
  } catch {
    // Never fail the report over an expansion — fall back, but say so honestly.
    return placeholderExpansion(input.courseTitle, weekNumbers);
  }
}
