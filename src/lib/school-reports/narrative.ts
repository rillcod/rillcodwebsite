import OpenAI from 'openai';
import { buildDeliveredTopicsSummary, buildDeliveryContext, buildReportTopicsPresentation, buildTopicsCoveredDraft } from './delivered-topics';
import {
  fallbackLeadershipReportStory,
  normalizeLeadershipReportStory,
} from './leadership-story';
import {
  dedupeStringList,
  textsSubstantiallyOverlap,
} from './report-content-dedup';
import { resolveLeadershipNarrativeForDisplay } from './topics-covered-presentation';
import { DEFAULT_SCHOOL_REPORT_POLICY } from './report-policy';
import { buildStudentRecommendations } from './student-recommendations';
import type { SchoolReportNarrative, SchoolReportSnapshot } from './types';

/**
 * Content fields staff can ask to have rewritten. `source` is excluded because
 * it records HOW the narrative was produced — asking the model to rewrite that
 * is meaningless, and it must never be settable from a rewrite request.
 */
export type NarrativeFieldKey = Exclude<keyof SchoolReportNarrative, 'source'>;

/** Deterministic template narrative. Exported so callers and the AI smoke check
 * can tell whether a report was actually written by a model or fell back. */
export function fallbackNarrative(snapshot: SchoolReportSnapshot): SchoolReportNarrative {
  const { summary, curriculum, insights } = snapshot;
  const policy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const achievements = insights?.strengths?.length
    ? [...insights.strengths]
    : [];
  const concerns = [
    ...(insights?.partnershipFocus || []),
    ...(insights?.growthAreas || []).slice(0, 2),
    ...(insights?.risks || []),
  ];
  const uniqueConcerns = [...new Set(concerns.map((item) => item.trim()).filter(Boolean))];
  if (!uniqueConcerns.length) {
    uniqueConcerns.push(
      `Together with ${snapshot.school.name}, we will build on this term's curriculum delivery and learner evidence.`,
    );
  }
  if (!achievements.length) {
    if (summary.averageScore >= 70) achievements.push(`Learners achieved a strong average score of ${summary.averageScore}%.`);
    if (summary.attendanceRate >= policy.attendance.strongMin) achievements.push(`Attendance was strong at ${summary.attendanceRate}%.`);
    if (summary.curriculumCoverage >= policy.grading.excellentMin) achievements.push(`${summary.curriculumCoverage}% of the selected curriculum range was completed.`);
    if (!achievements.length) achievements.push(`${summary.submissionsReceived} pieces of learner work were captured during the reporting period.`);
  }
  const recommendations = buildStudentRecommendations(snapshot, policy.display.maxRecommendations);
  const nextPeriodFocus = insights?.nextModuleFocus?.length
    ? [...insights.nextModuleFocus]
    : insights?.nextPhaseSchool?.flatMap((phase) => phase.actions).slice(0, 6) ||
      [
        curriculum.inProgressWeeks
          ? `Complete the ${curriculum.inProgressWeeks} curriculum week(s) currently in progress.`
          : 'Start and record the next planned curriculum weeks.',
        'Open the next module with clear learner goals drawn from this term\'s evidence.',
        insights?.bottomClass
          ? `Lift ${insights.bottomClass.className} toward the leading class average.`
          : 'Celebrate strong classes while sharing their effective teaching practices.',
      ];
  const deliveredTopics = buildDeliveredTopicsSummary(snapshot);
  const presentation = buildReportTopicsPresentation(snapshot);
  const topicsCovered = presentation?.sections?.length
    ? fallbackLeadershipReportStory(snapshot)
    : normalizeLeadershipReportStory(
        buildTopicsCoveredDraft(snapshot) ||
          deliveredTopics.proseSeed ||
          insights?.topicsProseSeed ||
          fallbackLeadershipReportStory(snapshot) ||
          '',
      ) || undefined;

  const rawNarrative: SchoolReportNarrative = {
    executiveSummary:
      insights?.headline ||
      `${snapshot.school.name} recorded ${summary.activeStudents} active learners, an average score of ${summary.averageScore}%, attendance of ${summary.attendanceRate}%, and ${summary.curriculumCoverage}% curriculum coverage for the selected range.`,
    topicsCovered,
    achievements: achievements.slice(0, 6),
    concerns: uniqueConcerns.slice(0, 6),
    recommendations: recommendations.slice(0, 6),
    nextPeriodFocus: nextPeriodFocus.slice(0, 6),
  };

  const leadershipNarrative = resolveLeadershipNarrativeForDisplay(
    rawNarrative.topicsCovered,
    presentation,
    { fallbackDraft: buildTopicsCoveredDraft(snapshot) },
  );
  if (presentation?.sections?.length && !leadershipNarrative) {
    rawNarrative.topicsCovered = undefined;
  } else if (leadershipNarrative) {
    rawNarrative.topicsCovered = normalizeLeadershipReportStory(leadershipNarrative);
  }

  return deduplicateNarrativeContent(rawNarrative);
}

/** Anti-repetition engine: strips duplicate items and repeated concepts across report sections. */
export function deduplicateNarrativeContent(narrative: SchoolReportNarrative): SchoolReportNarrative {
  const corpus: string[] = [];

  const executiveSummary = String(narrative.executiveSummary || '').trim();
  if (executiveSummary) corpus.push(executiveSummary);

  let topicsCovered = String(narrative.topicsCovered || '').trim() || undefined;
  if (topicsCovered && textsSubstantiallyOverlap(topicsCovered, executiveSummary)) {
    topicsCovered = undefined;
  } else if (topicsCovered) {
    corpus.push(topicsCovered);
  }

  const achievements = dedupeStringList(narrative.achievements || [], corpus, 6);
  corpus.push(...achievements);

  const concerns = dedupeStringList(narrative.concerns || [], corpus, 6);
  corpus.push(...concerns);

  const recommendations = dedupeStringList(narrative.recommendations || [], corpus, 6);
  const nextPeriodFocus = dedupeStringList(narrative.nextPeriodFocus || [], corpus, 6);

  return {
    executiveSummary,
    topicsCovered,
    achievements,
    concerns,
    recommendations,
    nextPeriodFocus,
  };
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 6) : [];
}

function compactAggregate(snapshot: SchoolReportSnapshot) {
  const deliveryContext = buildDeliveryContext(snapshot);
  const reportPolicy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  return {
    school: snapshot.school.name,
    period: snapshot.period,
    summary: snapshot.summary,
    scoreBands: snapshot.scoreBands.map(({ label, count }) => ({ label, count })),
    attendanceBands: snapshot.attendanceBands.map(({ label, count }) => ({ label, count })),
    classPerformance: (snapshot.classPerformance || []).slice(0, reportPolicy.display.maxChartRows).map((row) => ({
      className: row.className,
      teacherName: row.teacherName,
      students: row.students,
      averageScore: row.averageScore,
      attendanceRate: row.attendanceRate,
    })),
    programmeCoursePerformance: snapshot.programmeCoursePerformance || [],
    curriculum: {
      plannedWeeks: snapshot.curriculum.plannedWeeks,
      completedWeeks: snapshot.curriculum.completedWeeks,
      inProgressWeeks: snapshot.curriculum.inProgressWeeks,
      skippedWeeks: snapshot.curriculum.skippedWeeks,
      coverage: snapshot.summary.curriculumCoverage,
      courses: (snapshot.curriculum.courses || []).map((row) => ({
        programme: row.programme,
        course: row.course,
        completed: row.completed,
        planned: row.planned,
        inProgress: row.inProgress,
        coverage: row.coverage,
      })),
    },
    programmeCoverage: snapshot.deliveryDeclaration?.programmeCoverage || [],
    selectedProgrammes: [...new Set((snapshot.deliveryDeclaration?.selectedTopics || []).map((row) => row.programme))],
    deliveryDeclaration: snapshot.deliveryDeclaration
      ? {
          reportingWeeks: snapshot.deliveryDeclaration.reportingWeeks,
          selectedTopicCount: snapshot.deliveryDeclaration.selectedTopics.length,
          spannedWeeks: snapshot.deliveryDeclaration.spannedWeeks.slice(0, 8),
          selectedTopics: snapshot.deliveryDeclaration.selectedTopics.slice(0, 24).map((row) => ({
            programme: row.programme,
            course: row.course,
            topic: row.topic,
            weekNumber: row.weekNumber,
          })),
          nextTermCheckpoint: snapshot.deliveryDeclaration.nextTermCheckpoint || null,
        }
      : null,
    deliveryContext: {
      termLabel: deliveryContext.termLabel,
      windowLabel: deliveryContext.windowLabel,
      topicCount: deliveryContext.topicCount,
      draftParagraph: deliveryContext.draftParagraph,
      programmeDelivery: deliveryContext.aiBrief.programmeDelivery,
      deliveryPathNote: deliveryContext.aiBrief.deliveryPathNote,
    },
    insights: snapshot.insights
      ? {
          headline: snapshot.insights.headline,
          strengths: snapshot.insights.strengths,
          growthAreas: snapshot.insights.growthAreas,
          academicCoverage: snapshot.insights.academicCoverage,
          partnershipFocus: snapshot.insights.partnershipFocus,
          nextModuleFocus: snapshot.insights.nextModuleFocus,
          evidenceLedger: snapshot.insights.evidenceLedger,
          partnershipMilestones: snapshot.insights.partnershipMilestones,
          deliveryCommitment: snapshot.insights.deliveryCommitment,
          deliveredTopics: snapshot.insights.deliveredTopics,
          deliveryPathNote: snapshot.insights.deliveryPathNote,
          topicsProseSeed: snapshot.insights.topicsProseSeed,
          learnerHighlights: snapshot.insights.learnerHighlights,
          programmeSpotlight: snapshot.insights.programmeSpotlight,
          programmeSpotlights: snapshot.insights.programmeSpotlights,
          communityMessage: snapshot.insights.communityMessage,
          evidenceQualityPct: snapshot.insights.evidenceQualityPct,
        }
      : null,
    dataNotes: [],
  };
}

function mergeNarrative(
  base: SchoolReportNarrative,
  generated: SchoolReportNarrative,
  fields?: NarrativeFieldKey[],
): SchoolReportNarrative {
  if (!fields?.length) return generated;
  const next = { ...base };
  for (const field of fields) {
    if (field === 'executiveSummary') next.executiveSummary = generated.executiveSummary;
    else if (field === 'topicsCovered') next.topicsCovered = generated.topicsCovered;
    else next[field] = generated[field];
  }
  return next;
}

/**
 * OpenRouter model for the narrative.
 *
 * The previous default, google/gemini-2.0-flash-001, had been retired: OpenRouter
 * answered every request with "404 No endpoints found", so EVERY school report
 * silently fell back to template text. Nothing surfaced it because the fallback
 * is a legitimate code path that produces a valid-looking report.
 */
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.0-flash-exp:free';

/**
 * Ask for the narrative JSON, native Gemini first.
 *
 * The direct Gemini client is the verified-working path and uses the same key as
 * the rest of the report AI, so it leads. OpenRouter stays as a second chance
 * rather than the only one — a single retired model id should never again be
 * able to mute the whole feature.
 *
 * Returns null when both fail, which the caller treats as "use the factual
 * fallback".
 */
async function requestNarrativeJson(input: {
  client: OpenAI;
  model: string;
  temperature: number;
  maxTokens: number;
  content: string;
}): Promise<string | null> {
  try {
    const { geminiGenerateText } = await import('@/lib/gemini/client');
    const direct = await geminiGenerateText(
      'You return only valid JSON matching the requested shape. No prose outside the JSON.',
      input.content,
      true,
    );
    if (direct?.text) return direct.text;
  } catch (geminiError) {
    console.warn('[school-report] direct Gemini narrative failed, trying OpenRouter:',
      geminiError instanceof Error ? geminiError.message : geminiError);
  }

  const response = await input.client.chat.completions.create({
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: input.content }],
  });
  return response.choices[0]?.message?.content ?? null;
}

export async function createSchoolReportNarrative(
  snapshot: SchoolReportSnapshot,
  opts?: { fields?: NarrativeFieldKey[] },
): Promise<SchoolReportNarrative> {
  const fallback = fallbackNarrative(snapshot);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // No key configured at all — still a fallback, and staff should see that
    // rather than assume the model simply had nothing to add.
    const noKey = opts?.fields?.length ? mergeNarrative(fallback, fallback, opts.fields) : fallback;
    return { ...noKey, source: 'fallback' as const };
  }

  const aggregateOnly = compactAggregate(snapshot);
  const fields = opts?.fields?.length
    ? opts.fields
    : (['executiveSummary', 'topicsCovered', 'achievements', 'concerns', 'recommendations', 'nextPeriodFocus'] as NarrativeFieldKey[]);
  const fieldHint =
    fields.length === 6
      ? 'Return JSON with keys executiveSummary (string), topicsCovered (string), achievements (string[]), concerns (string[]), recommendations (string[]), nextPeriodFocus (string[]).'
      : `Return JSON with ONLY these keys: ${fields.join(', ')}. Use string for executiveSummary and topicsCovered; string[] for list fields.`;

  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
  const topicsOnly = fields.length === 1 && fields[0] === 'topicsCovered';
  const topicsPrompt = topicsOnly
    ? `Write ONLY topicsCovered — the report story: a professional 1–2 sentence summary for Nigerian school leadership and parents.

This is NOT a topic list. Structured course cards already show programmes, courses, and topics separately.

Rules:
- Maximum 2 sentences. Flowing prose only — no bullets, no lists.
- Do NOT include statistics: no percentages, learner counts, averages, attendance figures, or scores.
- Name programmes or courses only when it clarifies the story — focus on delivery quality and learning focus, not praise language.
- Tone: clear, factual, professional — suitable for a principal or parent reading a term report. Avoid effusive or repetitive partnership phrases.
- Do NOT repeat the executive summary or duplicate the structured topic checklist.
- Never use audit language, gap language, or "partial coverage" wording.

Return JSON: { "topicsCovered": "..." }`
    : null;

  try {
    const model =
      process.env.SCHOOL_REPORT_AI_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
    const raw = await requestNarrativeJson({
      client,
      model,
      temperature: topicsOnly ? 0.2 : 0.15,
      maxTokens: topicsOnly ? 180 : fields.length <= 2 ? 550 : 1100,
      content: topicsPrompt
          ? `${topicsPrompt}\n\n${JSON.stringify(compactAggregate(snapshot))}`
          : `You are writing ON BEHALF OF Rillcod Technologies for a partner school in Nigeria. The tone is professional, factual, and concise — a term delivery report, not marketing copy or an inspection.

Rules:
- Treat the current report structure as fixed: the canonical section is "Curriculum Delivery". Never call it "Programme & Course Delivery" and never propose extra duplicate sections.
- Respect programme selection. Use selectedProgrammes and programmeCoverage when present; mention every selected programme and do not introduce an unselected one.
- Coverage is programme-specific. Never turn one programme's percentage into a school-wide claim; use the combined curriculum.coverage only as an overall summary.
- executiveSummary: one factual paragraph for school leadership — headline numbers only, no bullet dumps, no repeated phrases from other sections.
- topicsCovered: the report story — max 2 sentences, no statistics, professional Nigeria-context prose. Course delivery details are shown separately; do not list topics or repeat metrics.
- Strengths: cite real numbers and names from the data — state what went well without effusive praise.
- Growth opportunities (concerns field): return 2-3 connected actions. Each action must name the evidence that triggered it, state what Rillcod/school/families will do next, and identify the check point. Never blame the school.
- Do NOT write generic "at risk" counts, evidence gaps, or internal checklist language unless a metric is critically low.
- recommendations: return 2-4 brief, concrete actions written for students; one action per item.
- nextPeriodFocus: tie to the next module without repeating Curriculum Delivery wording or "What opens next" lines.
- Keep achievements brief and evidence-based. Do not repeat executive-summary metrics in several fields.
- The community message is generated separately; do not recreate it inside any narrative field.
- Never use jargon like "recovery clinic", "fortnightly", "named recovery list", or "Phase 1".
- Write for Nigerian school principals and parents in plain English.
- Use ONLY the facts below — do not invent people, events, or numbers.
${fieldHint}

${JSON.stringify(aggregateOnly)}`,
    });
    const parsed = JSON.parse(raw || '{}');
    const policy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
    const generated: SchoolReportNarrative = {
      executiveSummary: String(parsed.executiveSummary || fallback.executiveSummary).trim().slice(0, 2400),
      topicsCovered: normalizeLeadershipReportStory(
        String(parsed.topicsCovered || fallback.topicsCovered || '').trim(),
      ) || undefined,
      achievements: cleanStringArray(parsed.achievements).length ? cleanStringArray(parsed.achievements) : fallback.achievements,
      concerns: cleanStringArray(parsed.concerns).length ? cleanStringArray(parsed.concerns) : fallback.concerns,
      recommendations: buildStudentRecommendations(snapshot, policy.display.maxRecommendations),
      nextPeriodFocus: cleanStringArray(parsed.nextPeriodFocus).length ? cleanStringArray(parsed.nextPeriodFocus) : fallback.nextPeriodFocus,
    };
    const result = opts?.fields?.length ? mergeNarrative(fallback, generated, opts.fields) : generated;
    return { ...deduplicateNarrativeContent(result), source: 'ai' as const };
  } catch (error) {
    console.error('[school-report] AI narrative unavailable; using factual fallback:', error instanceof Error ? error.message : error);
    const result = opts?.fields?.length ? mergeNarrative(fallback, fallback, opts.fields) : fallback;
    return { ...deduplicateNarrativeContent(result), source: 'fallback' as const };
  }
}

/** Fast AI rewrite that keeps staff text outside the requested fields. */
export async function rewriteSchoolReportNarrativeFields(
  snapshot: SchoolReportSnapshot,
  current: SchoolReportNarrative,
  fields: NarrativeFieldKey[],
): Promise<{ narrative: SchoolReportNarrative; usedAi: boolean }> {
  const usedAi = Boolean(process.env.OPENROUTER_API_KEY);
  const generated = await createSchoolReportNarrative(snapshot, { fields });
  return {
    narrative: mergeNarrative(current, generated, fields),
    usedAi,
  };
}

