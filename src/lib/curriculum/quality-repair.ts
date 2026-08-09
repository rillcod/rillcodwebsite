/**
 * Let the AI mend a curriculum that fails the publication gate, instead of handing the Academic
 * Office a list of faults to fix by hand.
 *
 * The gate in qualityGate.ts blocks publishing for missing topics, invalid or duplicated week
 * positions, and empty terms. Those are exactly the gaps a model is good at closing — but the
 * cheapest way for a model to satisfy "no duplicate week positions" is to delete a week, and the
 * cheapest way to satisfy "every term has weeks" is to drop the empty term. Both would pass the
 * gate while quietly destroying curriculum an author wrote.
 *
 * So the model's output is never trusted on its own: `acceptRepair` refuses any candidate that
 * loses a term or a week, or that does not strictly reduce the error count. A repair that cannot
 * clear that bar is discarded and the original is kept.
 */
import { inspectCurriculumQuality, type CurriculumQualityIssue } from './qualityGate';
import { runAcademicQualityEngine, type AcademicQualityReport } from '@/lib/qa/academicQualityEngine';

export type RepairOutcome = {
  status: 'not_needed' | 'repaired' | 'rejected' | 'unavailable';
  content: unknown;
  /** Errors before the repair ran. */
  before: { errors: CurriculumQualityIssue[]; warnings: CurriculumQualityIssue[] };
  /** Errors after, when a candidate was produced. */
  after?: { errors: CurriculumQualityIssue[]; warnings: CurriculumQualityIssue[] };
  reason?: string;
  model?: string;
};

export const REPAIR_SYSTEM_PROMPT = [
  'You repair school curriculum documents for a Nigerian STEM and computing academy.',
  'You will be given a curriculum as JSON and a list of quality faults found in it.',
  '',
  'Rules, in order of importance:',
  '1. NEVER delete a term or a week. Never merge two weeks into one. The repaired document must',
  '   contain at least as many terms and at least as many weeks as the original.',
  '2. Fix a duplicated week position by renumbering, never by removing the week.',
  '3. Where a topic is missing, write one specific to that subject and appropriate to the year',
  '   group — not a placeholder like "TBD", "Topic", or "Week 3".',
  '4. Where focus points are missing, add three to five short, teachable bullet points',
  '   under the week\'s "subtopics" array.',
  '5. Where a practical activity is missing, add one achievable hands-on or discussion task',
  '   under the week\'s "lesson_plan"."activities" array. It must be doable in a normal Nigerian',
  '   classroom — assume shared or intermittent computer access and no paid software.',
  '6. Where evidence of learning is missing, add a short check under the week\'s',
  '   "assessment_plan" object — a demonstration, a project milestone, a few questions, or a',
  '   reflection. Keep it markable by one teacher in one lesson.',
  '7. Leave every field that was already valid exactly as it was. NEVER reword an existing topic:',
  '   the wording is the Academic Office\'s, not yours. Only fill what is empty or missing.',
  '8. Keep the original JSON shape and key names precisely.',
  '',
  'Return only the corrected curriculum as JSON. No commentary, no markdown fence.',
].join('\n');

export function buildRepairPrompt(content: unknown, issues: CurriculumQualityIssue[]): string {
  const faults = issues.map((i) => `- [${i.level}] ${i.location}: ${i.message}`).join('\n');
  return [
    'Faults to correct:',
    faults || '- (none reported)',
    '',
    'Curriculum JSON:',
    JSON.stringify(content, null, 2),
  ].join('\n');
}

/** Pull a JSON object out of a model response that may still be fenced or prefixed. */
export function parseRepairResponse(raw: string): unknown | null {
  if (!raw) return null;
  const direct = raw.trim();
  try {
    return JSON.parse(direct);
  } catch {
    /* fall through to a fenced or embedded object */
  }
  const match = direct.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function shape(content: unknown): { terms: number; weeks: number } {
  const doc = content && typeof content === 'object' && !Array.isArray(content)
    ? (content as Record<string, unknown>)
    : {};
  const terms = Array.isArray(doc.terms) ? (doc.terms as Array<Record<string, unknown>>) : [];
  let weeks = 0;
  for (const term of terms) if (Array.isArray(term?.weeks)) weeks += (term.weeks as unknown[]).length;
  return { terms: terms.length, weeks };
}

/**
 * Decide whether a repaired document may replace the original.
 *
 * Deliberately strict. Passing the gate is not sufficient — deleting every term would also pass
 * the "no invalid week" checks. The candidate has to keep all the content AND fix something.
 */
export function acceptRepair(
  original: unknown,
  candidate: unknown,
): { ok: boolean; reason?: string } {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, reason: 'The repair was not a curriculum object.' };
  }
  const doc = candidate as Record<string, unknown>;
  if (!Array.isArray(doc.terms)) {
    return { ok: false, reason: 'The repair had no terms array.' };
  }

  const before = shape(original);
  const after = shape(candidate);
  if (after.terms < before.terms) {
    return { ok: false, reason: `The repair dropped ${before.terms - after.terms} term(s).` };
  }
  if (after.weeks < before.weeks) {
    return { ok: false, reason: `The repair dropped ${before.weeks - after.weeks} teaching week(s).` };
  }

  const originalErrors = inspectCurriculumQuality(original).errors.length;
  const candidateErrors = inspectCurriculumQuality(candidate).errors.length;
  if (candidateErrors >= originalErrors && originalErrors > 0) {
    return { ok: false, reason: 'The repair did not reduce the number of faults.' };
  }
  return { ok: true };
}

/**
 * Every topic the author already wrote, keyed by its position.
 *
 * Used to prove a repair did not quietly reword the curriculum. Filling a blank
 * is help; rewriting "Stewarding God's Provisions: Variables and Data Types"
 * into something blander is the model overwriting the Academic Office, and it
 * would be almost impossible to spot in a 24-week diff.
 */
function topicsByPosition(content: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const doc = content && typeof content === 'object' && !Array.isArray(content)
    ? (content as Record<string, unknown>)
    : {};
  const terms = Array.isArray(doc.terms) ? (doc.terms as Array<Record<string, unknown>>) : [];
  for (const term of terms) {
    const weeks = Array.isArray(term?.weeks) ? (term.weeks as Array<Record<string, unknown>>) : [];
    for (const week of weeks) {
      const topic = typeof week?.topic === 'string' ? week.topic.trim() : '';
      if (!topic) continue;
      out.set(`${term?.year ?? 1}:${term?.term}:${week?.week}`, topic);
    }
  }
  return out;
}

export type SolidifyOutcome = {
  status: 'not_needed' | 'repaired' | 'rejected' | 'unavailable';
  content: unknown;
  before: AcademicQualityReport;
  after?: AcademicQualityReport;
  reason?: string;
  model?: string;
};

/**
 * Decide whether a solidified document may replace the original.
 *
 * Judged by the same engine the readiness screen shows, because that is what
 * the Academic Office is being asked to act on. `acceptRepair` could not do this
 * job: it scores against qualityGate, which has no concept of a missing activity
 * or a missing assessment at all — the two findings that made up 16 of the 17
 * suggestions on the live Python curriculum. It also waves through a candidate
 * that changed nothing whenever the gate already passed, which is exactly the
 * case a "solidify" pass runs in.
 */
export function acceptSolidified(
  original: unknown,
  candidate: unknown,
  context: Parameters<typeof runAcademicQualityEngine>[1] = {},
): { ok: boolean; reason?: string } {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, reason: 'The repair was not a curriculum object.' };
  }
  if (!Array.isArray((candidate as Record<string, unknown>).terms)) {
    return { ok: false, reason: 'The repair had no terms array.' };
  }

  const before = shape(original);
  const after = shape(candidate);
  if (after.terms < before.terms) {
    return { ok: false, reason: `The repair dropped ${before.terms - after.terms} term(s).` };
  }
  if (after.weeks < before.weeks) {
    return { ok: false, reason: `The repair dropped ${before.weeks - after.weeks} teaching week(s).` };
  }

  const originalTopics = topicsByPosition(original);
  const candidateTopics = topicsByPosition(candidate);
  for (const [position, topic] of originalTopics) {
    const next = candidateTopics.get(position);
    if (next === undefined) {
      return { ok: false, reason: `The repair lost the topic at ${position}.` };
    }
    if (next !== topic) {
      return { ok: false, reason: `The repair reworded an existing topic at ${position}.` };
    }
  }

  const beforeReport = runAcademicQualityEngine(original, context);
  const afterReport = runAcademicQualityEngine(candidate, context);
  if (afterReport.mustFix.length > beforeReport.mustFix.length) {
    return { ok: false, reason: 'The repair introduced new must-fix faults.' };
  }
  const beforeTotal = beforeReport.mustFix.length + beforeReport.improvements.length;
  const afterTotal = afterReport.mustFix.length + afterReport.improvements.length;
  if (afterTotal >= beforeTotal) {
    return { ok: false, reason: 'The repair did not reduce the number of findings.' };
  }
  if (afterReport.score < beforeReport.score) {
    return { ok: false, reason: 'The repair lowered the academic quality score.' };
  }
  return { ok: true };
}

type GenerateText = (
  system: string,
  user: string,
  jsonMode?: boolean,
) => Promise<{ text: string; model: string } | null>;

/**
 * Close the gaps the readiness check reports, instead of only listing them.
 *
 * The readiness screen was already accurate — it found 17 real gaps in the live
 * Python curriculum and correctly called it publishable. What it could not do
 * was act: the repair button behind it ran against qualityGate, which does not
 * check activities or assessments, so the very findings on screen were the ones
 * repair could never touch.
 */
export async function solidifyCurriculumQuality(
  content: unknown,
  generate: GenerateText,
  context: Parameters<typeof runAcademicQualityEngine>[1] = {},
): Promise<SolidifyOutcome> {
  const before = runAcademicQualityEngine(content, context);
  // Provenance findings describe what the publish FORM supplies (source name,
  // session, audience), not the document. Sending them would invite the model to
  // invent an academic standard the Academic Office never approved.
  const documentIssues = [...before.mustFix, ...before.improvements]
    .filter((issue) => issue.dimension !== 'academic_foundation');

  if (documentIssues.length === 0) {
    return { status: 'not_needed', content, before };
  }

  const faults = documentIssues.map((issue) => `- [${issue.severity}] ${issue.location}: ${issue.message} — ${issue.action}`);
  const prompt = [
    'Faults to correct:',
    faults.join('\n'),
    '',
    'Curriculum JSON:',
    JSON.stringify(content, null, 2),
  ].join('\n');

  const result = await generate(REPAIR_SYSTEM_PROMPT, prompt, true).catch(() => null);
  if (!result?.text) {
    return { status: 'unavailable', content, before, reason: 'The AI service did not respond.' };
  }

  const candidate = parseRepairResponse(result.text);
  if (!candidate) {
    return { status: 'rejected', content, before, reason: 'The repair was not valid JSON.', model: result.model };
  }

  const verdict = acceptSolidified(content, candidate, context);
  if (!verdict.ok) {
    return { status: 'rejected', content, before, reason: verdict.reason, model: result.model };
  }

  return {
    status: 'repaired',
    content: candidate,
    before,
    after: runAcademicQualityEngine(candidate, context),
    model: result.model,
  };
}

/**
 * Inspect, and when the document is short of publishable, ask the model to mend it.
 * `generate` is injected so this is testable without calling a model.
 */
export async function repairCurriculumQuality(
  content: unknown,
  generate: GenerateText,
  opts: { includeWarnings?: boolean } = {},
): Promise<RepairOutcome> {
  const initial = inspectCurriculumQuality(content);
  const before = { errors: initial.errors, warnings: initial.warnings };

  const targets = opts.includeWarnings
    ? [...initial.errors, ...initial.warnings]
    : initial.errors;
  if (targets.length === 0) {
    return { status: 'not_needed', content, before };
  }

  const result = await generate(
    REPAIR_SYSTEM_PROMPT,
    buildRepairPrompt(content, targets),
    true,
  ).catch(() => null);

  if (!result?.text) {
    return { status: 'unavailable', content, before, reason: 'The AI service did not respond.' };
  }

  const candidate = parseRepairResponse(result.text);
  if (!candidate) {
    return { status: 'rejected', content, before, reason: 'The repair was not valid JSON.', model: result.model };
  }

  const verdict = acceptRepair(content, candidate);
  if (!verdict.ok) {
    return { status: 'rejected', content, before, reason: verdict.reason, model: result.model };
  }

  const post = inspectCurriculumQuality(candidate);
  return {
    status: 'repaired',
    content: candidate,
    before,
    after: { errors: post.errors, warnings: post.warnings },
    model: result.model,
  };
}
