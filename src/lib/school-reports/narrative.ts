import OpenAI from 'openai';
import { buildDeliveredTopicsSummary, buildDeliveryContext, buildTopicsCoveredDraft } from './delivered-topics';
import { DEFAULT_SCHOOL_REPORT_POLICY } from './report-policy';
import type { SchoolReportNarrative, SchoolReportSnapshot } from './types';

export type NarrativeFieldKey = keyof SchoolReportNarrative;

function fallbackNarrative(snapshot: SchoolReportSnapshot): SchoolReportNarrative {
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
  const recommendations = insights?.priorities?.length
    ? [...insights.priorities]
    : [
        'Practise one key skill for a few minutes each day and ask for help when a step is unclear.',
        'Complete an age-appropriate mini-project that applies this term’s learning.',
        'Share completed work with a teacher or family member and use the feedback to improve it.',
      ];
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
  const topicsCovered =
    buildTopicsCoveredDraft(snapshot) ||
    deliveredTopics.proseSeed ||
    insights?.topicsProseSeed ||
    (insights?.academicCoverage?.length ? insights.academicCoverage.slice(0, 3).join(' ') : '') ||
    (curriculum.courses?.length
      ? `During ${snapshot.period.termLabel}, learners worked across ${curriculum.courses
          .slice(0, 4)
          .map((row) => `${row.programme} · ${row.course}`)
          .join('; ')}${curriculum.courses.length > 4 ? '; and further modules' : ''}. This reflects the school's delivery path for the term — not necessarily every week on the curriculum map.`
      : `Learner and curriculum evidence for ${snapshot.period.termLabel} at ${snapshot.school.name} is still being captured — refresh the snapshot after teachers log results or curriculum weeks.`);

  const rawNarrative: SchoolReportNarrative = {
    executiveSummary:
      insights?.headline ||
      `${snapshot.school.name} recorded ${summary.activeStudents} active learners, an average score of ${summary.averageScore}%, attendance of ${summary.attendanceRate}%, and ${summary.curriculumCoverage}% curriculum coverage for the selected range.`,
    topicsCovered,
    achievements: achievements.slice(0, 6),
    concerns: uniqueConcerns.slice(0, 6),
    recommendations: [
      ...recommendations.slice(0, 4),
      ...(insights?.partnershipFocus || []).slice(0, 2),
    ].slice(0, 6),
    nextPeriodFocus: nextPeriodFocus.slice(0, 6),
  };

  return deduplicateNarrativeContent(rawNarrative);
}

/** Anti-repetition engine: strips duplicate items and repeated concepts across report sections. */
export function deduplicateNarrativeContent(narrative: SchoolReportNarrative): SchoolReportNarrative {
  const seenTexts = new Set<string>();
  const normalize = (txt: string) => txt.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

  const cleanList = (items: string[]) => {
    const result: string[] = [];
    for (const item of items) {
      const norm = normalize(item);
      if (!norm || norm.length < 5) continue;
      if (seenTexts.has(norm)) continue;
      // Also check fuzzy overlap
      let isDuplicate = false;
      for (const seen of seenTexts) {
        if (seen.includes(norm) || norm.includes(seen)) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        seenTexts.add(norm);
        result.push(item);
      }
    }
    return result;
  };

  return {
    executiveSummary: narrative.executiveSummary,
    topicsCovered: narrative.topicsCovered,
    achievements: cleanList(narrative.achievements || []),
    concerns: cleanList(narrative.concerns || []),
    recommendations: cleanList(narrative.recommendations || []),
    nextPeriodFocus: cleanList(narrative.nextPeriodFocus || []),
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

export async function createSchoolReportNarrative(
  snapshot: SchoolReportSnapshot,
  opts?: { fields?: NarrativeFieldKey[] },
): Promise<SchoolReportNarrative> {
  const fallback = fallbackNarrative(snapshot);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return opts?.fields?.length ? mergeNarrative(fallback, fallback, opts.fields) : fallback;

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
    ? `Write ONLY topicsCovered — a warm 2–4 sentence paragraph for school leadership and parents.

Use deliveryContext.programmeDelivery as your source of truth:
- Name each programme and course explicitly.
- If programmeDelivery lists multiple courses, mention every course — do not focus on only one.
- Include the weekRange for each course (e.g. "Weeks 1–2 of 12" or "evidence from results — school path").
- Mention learner counts and term averages when present in the data.
- If topicCount is 1–2, say honestly that the school focused on a narrow path this term — that is normal.
- Never claim full curriculum coverage unless curriculum.coverage is high and weeks support it.
- Do NOT list bullet points. Write flowing prose.
- Do NOT repeat executive summary numbers.

Return JSON: { "topicsCovered": "..." }`
    : null;

  try {
    const response = await client.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      temperature: topicsOnly ? 0.2 : 0.15,
      max_tokens: topicsOnly ? 650 : fields.length <= 2 ? 550 : 1100,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: topicsPrompt
          ? `${topicsPrompt}\n\n${JSON.stringify(compactAggregate(snapshot))}`
          : `You are writing ON BEHALF OF Rillcod Technologies TO a partner school we serve — warm, confident, factual, and human. This is a partnership delivery report we are proud to share, not an audit or inspection.

Rules:
- Treat the current report structure as fixed: the canonical section is "Curriculum Delivery". Never call it "Programme & Course Delivery" and never propose extra duplicate sections.
- Respect programme selection. Use selectedProgrammes and programmeCoverage when present; mention every selected programme and do not introduce an unselected one.
- Coverage is programme-specific. Never turn one programme's percentage into a school-wide claim; use the combined curriculum.coverage only as an overall summary.
- executiveSummary: one warm paragraph for school leadership — headline numbers only, no bullet dumps.
- topicsCovered: 2–4 sentences describing WHAT was actually taught. Use deliveryContext.programmeDelivery — each programme, course, and its own weekRange. Curriculum lengths vary, so never assume a 12-week window. Match learner counts and averages from the data. Flowing prose only — no bullet dumps.
- Strengths: cite real numbers and names from the data — celebrate what the school and learners did well.
- Growth opportunities (concerns field): return 2-3 connected partnership actions. Each action must name the evidence that triggered it (learner group, attendance, class, selected programme, or delivery coverage), state what Rillcod/school/families will do, and identify the next check. Never blame the school and never write a generic review statement.
- Do NOT write generic "at risk" counts, evidence gaps, or internal checklist language unless a metric is critically low.
- recommendations: return 2-4 brief, concrete actions written for students; one action per item, no sermons, no school-management instructions.
- nextPeriodFocus: tie to the next module and learner report themes without repeating Curriculum Delivery wording.
- Keep achievements brief and evidence-based. Do not repeat executive-summary metrics in several fields.
- The community message is generated separately as exactly three engagement sentences; do not recreate it inside any narrative field.
- When communityMessage or deliveryCommitment exist in insights, mirror the warm partnership tone without copying their sentences.
- Never use jargon like "recovery clinic", "fortnightly", "named recovery list", or "Phase 1".
- Write for Nigerian school principals and parents in plain English.
- Use ONLY the facts below — do not invent people, events, or numbers.
${fieldHint}

${JSON.stringify(aggregateOnly)}`,
      }],
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const generated: SchoolReportNarrative = {
      executiveSummary: String(parsed.executiveSummary || fallback.executiveSummary).trim().slice(0, 2400),
      topicsCovered: String(parsed.topicsCovered || fallback.topicsCovered || '').trim().slice(0, 3200),
      achievements: cleanStringArray(parsed.achievements).length ? cleanStringArray(parsed.achievements) : fallback.achievements,
      concerns: cleanStringArray(parsed.concerns).length ? cleanStringArray(parsed.concerns) : fallback.concerns,
      recommendations: cleanStringArray(parsed.recommendations).length ? cleanStringArray(parsed.recommendations) : fallback.recommendations,
      nextPeriodFocus: cleanStringArray(parsed.nextPeriodFocus).length ? cleanStringArray(parsed.nextPeriodFocus) : fallback.nextPeriodFocus,
    };
    const result = opts?.fields?.length ? mergeNarrative(fallback, generated, opts.fields) : generated;
    return deduplicateNarrativeContent(result);
  } catch (error) {
    console.error('[school-report] AI narrative unavailable; using factual fallback:', error instanceof Error ? error.message : error);
    const result = opts?.fields?.length ? mergeNarrative(fallback, fallback, opts.fields) : fallback;
    return deduplicateNarrativeContent(result);
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

export { fallbackNarrative };
