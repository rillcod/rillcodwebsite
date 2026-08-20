/**
 * Shared doctrine for on-spot syllabus generation and school-report delivery.
 * Rillcod runs a 12-year accredited ladder (Basic 1 → SS 3): every week is the
 * next rung, never a repeat of something learners already covered.
 */

export const PROGRESSIVE_12_YEAR_SUMMARY =
  'Rillcod\'s 12-year accredited STEM ladder (Basic 1 through SS 3): zero-to-hero, step-by-step, with no topic repetition across years or terms.';

const TERM_ARC: Record<number, string> = {
  1: 'Term 1 — foundations: first concepts, guided wins, confidence building',
  2: 'Term 2 — application: deeper practice, longer builds, more independence',
  3: 'Term 3 — mastery: consolidation, showcase projects, exam-ready checkpoints',
};

/** National term position within an academic year (1–3). */
export function nationalTermArcLabel(termNumber: number): string {
  const slot = ((Math.max(1, Math.trunc(termNumber)) - 1) % 3) + 1;
  return TERM_ARC[slot] ?? TERM_ARC[1];
}

/** System rules appended to week-expansion prompts. */
export function progressiveCurriculumSystemRules(weekCount: number): string[] {
  return [
    PROGRESSIVE_12_YEAR_SUMMARY,
    'You are planning ONE slice of that ladder for ONE course in ONE reporting window.',
    'Rules:',
    `- Return EXACTLY ${weekCount} objects, one for every week number in weeksToPlan. Do not skip any. Do not add any.`,
    '- NEVER repeat a topic, skill, project, or assessment already listed in topicsAlreadyCovered or alreadyPlannedThisTerm. Each week must be the NEXT progressive step.',
    '- Escalate difficulty week by week within the window: concrete foundations → guided practice → applied builds → consolidation/checkpoint.',
    '- Topics must be specific and detailed (what learners actually do), not generic filler such as "Core concepts & guided practice" or "Week N Lab".',
    '- Honour the programme track and implied learner age from the course title (Scratch/visual for younger years; Python/web/robotics depth for senior years).',
    '- Mark roughly every fourth week as an assessment week.',
    '- Objectives: AT MOST 2 per week, each under 12 words. Brevity matters more than detail in objectives; topic titles carry the detail.',
    '- Use plain English suitable for Nigerian school leadership. No marketing language.',
    'Return JSON: { "weeks": [ { "week": number, "topic": string, "weekType": "lesson" | "assessment", "objectives": string[] } ] }',
  ];
}

export type ProgressiveExpansionContextInput = {
  courseTitle: string;
  programme: string;
  schoolName?: string | null;
  termLabel?: string | null;
  termNumber: number;
  weekNumbers: number[];
  reachedTopics?: string[];
  alreadyPlanned?: Array<{ week: number; topic: string }>;
};

/** User payload fields that anchor the model in the progressive ladder. */
export function buildProgressiveExpansionContext(input: ProgressiveExpansionContextInput): Record<string, unknown> {
  const reached = (input.reachedTopics ?? []).map((topic) => String(topic).trim()).filter(Boolean).slice(0, 60);
  const base: Record<string, unknown> = {
    curriculumModel: 'rillcod_12_year_progressive_ladder',
    curriculumDoctrine:
      'Zero-to-hero step-by-step delivery. No repetition — every week advances from what learners already covered in prior years, terms, and weeks.',
    course: input.courseTitle,
    programme: input.programme,
    school: input.schoolName ?? null,
    term: input.termLabel ?? `Term ${input.termNumber}`,
    termNumber: input.termNumber,
    termArc: nationalTermArcLabel(input.termNumber),
    weeksToPlan: input.weekNumbers,
    weekCount: input.weekNumbers.length,
    topicsAlreadyCovered: reached,
    antiRepetitionRule:
      'Do not reuse any string from topicsAlreadyCovered or alreadyPlannedThisTerm. Invent the next sequential step only.',
  };

  if (input.alreadyPlanned?.length) {
    base.alreadyPlannedThisTerm = input.alreadyPlanned;
    base.instruction =
      'Fill ONLY the weeks in weeksToPlan. They must fit sequentially between the alreadyPlannedThisTerm weeks around them, continuing the progressive ladder without repeating earlier topics.';
  }

  return base;
}
