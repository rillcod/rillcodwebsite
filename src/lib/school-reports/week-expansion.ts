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
export function normaliseExpansion(
  parsed: unknown,
  input: Pick<ExpandCourseWeeksInput, 'courseTitle' | 'weekNumbers'>,
): ExpandedWeek[] | null {
  const rows = Array.isArray((parsed as { weeks?: unknown })?.weeks)
    ? ((parsed as { weeks: unknown[] }).weeks)
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;
  if (!rows) return null;

  const byWeek = new Map<number, ExpandedWeek>();
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

  // Partial coverage is rejected outright rather than silently padded, so a
  // half-answered model response cannot masquerade as a complete plan.
  const covered = input.weekNumbers.filter((week) => byWeek.has(week));
  if (covered.length !== input.weekNumbers.length) return null;

  return input.weekNumbers.map((week) => byWeek.get(week)!);
}

export async function expandCourseDeliveryWeeks(input: ExpandCourseWeeksInput): Promise<WeekExpansion> {
  const weekNumbers = [...new Set(input.weekNumbers.filter((week) => Number.isFinite(week)))].sort((a, b) => a - b);
  if (!weekNumbers.length) return { weeks: [], source: 'placeholder', model: null };

  const reached = (input.reachedTopics ?? []).map((topic) => String(topic).trim()).filter(Boolean).slice(0, 60);

  const systemPrompt = [
    'You plan week-by-week delivery for a STEM and computer-science provider working with Nigerian schools.',
    'You produce a teaching plan a Head of School would recognise as real: concrete, sequential, and specific to the named course.',
    'Rules:',
    '- Return one entry for EVERY requested week number. Never skip or invent extra weeks.',
    '- Topics must be specific to the course. Never emit generic filler such as "Core concepts & guided practice" or "Week N Lab".',
    '- Build a sensible progression: foundations first, then application, then consolidation.',
    '- When existing covered topics are supplied, continue and deepen that sequence — do not restate it verbatim.',
    '- Mark roughly every fourth week as an assessment week.',
    '- Objectives: at most 3 per week, each a short plain-English outcome.',
    '- Use plain English suitable for Nigerian school leadership. No marketing language.',
    'Return JSON: { "weeks": [ { "week": number, "topic": string, "weekType": "lesson" | "assessment", "objectives": string[] } ] }',
  ].join('\n');

  const userPrompt = JSON.stringify({
    course: input.courseTitle,
    programme: input.programme,
    school: input.schoolName ?? null,
    term: input.termLabel ?? `Term ${input.termNumber}`,
    termNumber: input.termNumber,
    weeksToPlan: weekNumbers,
    topicsAlreadyCovered: reached,
  });

  try {
    const result = await geminiGenerateText(systemPrompt, userPrompt, true);
    if (!result?.text) return placeholderExpansion(input.courseTitle, weekNumbers);

    const parsed = JSON.parse(result.text) as unknown;
    const weeks = normaliseExpansion(parsed, { courseTitle: input.courseTitle, weekNumbers });
    if (!weeks) return placeholderExpansion(input.courseTitle, weekNumbers);

    return { weeks, source: 'ai', model: result.model };
  } catch {
    // Never fail the report over an expansion — fall back, but say so honestly.
    return placeholderExpansion(input.courseTitle, weekNumbers);
  }
}
