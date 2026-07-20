import OpenAI from 'openai';
import type { SchoolReportNarrative, SchoolReportSnapshot } from './types';

export type NarrativeFieldKey = keyof SchoolReportNarrative;

function fallbackNarrative(snapshot: SchoolReportSnapshot): SchoolReportNarrative {
  const { summary, curriculum, insights } = snapshot;
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
    if (summary.attendanceRate >= 80) achievements.push(`Attendance was strong at ${summary.attendanceRate}%.`);
    if (summary.curriculumCoverage >= 75) achievements.push(`${summary.curriculumCoverage}% of the selected curriculum range was completed.`);
    if (!achievements.length) achievements.push(`${summary.submissionsReceived} pieces of learner work were captured during the reporting period.`);
  }
  const recommendations = insights?.priorities?.length
    ? [...insights.priorities]
    : [
        'Agree the next curriculum module with school leadership and assigned teachers.',
        'Celebrate class successes while spreading effective practices across the school.',
        'Refresh this report book after the next module opens to keep delivery evidence current.',
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
  return {
    executiveSummary:
      insights?.headline ||
      `${snapshot.school.name} recorded ${summary.activeStudents} active learners, an average score of ${summary.averageScore}%, attendance of ${summary.attendanceRate}%, and ${summary.curriculumCoverage}% curriculum coverage for the selected range.`,
    achievements: achievements.slice(0, 6),
    concerns: uniqueConcerns.slice(0, 6),
    recommendations: [
      ...recommendations.slice(0, 4),
      ...(insights?.partnershipFocus || []).slice(0, 2),
    ].slice(0, 6),
    nextPeriodFocus: nextPeriodFocus.slice(0, 6),
  };
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 6) : [];
}

function compactAggregate(snapshot: SchoolReportSnapshot) {
  return {
    school: snapshot.school.name,
    period: snapshot.period,
    summary: snapshot.summary,
    scoreBands: snapshot.scoreBands.map(({ label, count }) => ({ label, count })),
    attendanceBands: snapshot.attendanceBands.map(({ label, count }) => ({ label, count })),
    classPerformance: (snapshot.classPerformance || []).slice(0, 12).map((row) => ({
      className: row.className,
      teacherName: row.teacherName,
      students: row.students,
      averageScore: row.averageScore,
      attendanceRate: row.attendanceRate,
    })),
    programmeCoursePerformance: (snapshot.programmeCoursePerformance || []).slice(0, 8),
    curriculum: {
      plannedWeeks: snapshot.curriculum.plannedWeeks,
      completedWeeks: snapshot.curriculum.completedWeeks,
      inProgressWeeks: snapshot.curriculum.inProgressWeeks,
      skippedWeeks: snapshot.curriculum.skippedWeeks,
      coverage: snapshot.summary.curriculumCoverage,
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
          learnerHighlights: snapshot.insights.learnerHighlights,
          programmeSpotlight: snapshot.insights.programmeSpotlight,
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
    : (['executiveSummary', 'achievements', 'concerns', 'recommendations', 'nextPeriodFocus'] as NarrativeFieldKey[]);
  const fieldHint =
    fields.length === 5
      ? 'Return JSON with keys executiveSummary (string), achievements (string[]), concerns (string[]), recommendations (string[]), nextPeriodFocus (string[]).'
      : `Return JSON with ONLY these keys: ${fields.join(', ')}. Use string for executiveSummary and string[] for list fields.`;

  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
  try {
    const response = await client.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      temperature: 0.15,
      max_tokens: fields.length <= 2 ? 450 : 900,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `You are writing ON BEHALF OF Rillcod Technologies TO a partner school we serve — warm, confident, factual, and human. This is a partnership delivery report we are proud to share, not an audit or inspection.

Rules:
- Strengths: cite real numbers and names from the data — celebrate what the school and learners did well.
- Growth opportunities (concerns field): frame as joint partnership focus — what Rillcod and the school will do together. Never blame the school.
- Do NOT write generic "at risk" counts, evidence gaps, or internal checklist language unless a metric is critically low.
- Recommendations and nextPeriodFocus: tie to curriculum coverage, next module, and learner report themes when present.
- When communityMessage or deliveryCommitment exist in insights, mirror that partnership delivery tone.
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
      achievements: cleanStringArray(parsed.achievements).length ? cleanStringArray(parsed.achievements) : fallback.achievements,
      concerns: cleanStringArray(parsed.concerns).length ? cleanStringArray(parsed.concerns) : fallback.concerns,
      recommendations: cleanStringArray(parsed.recommendations).length ? cleanStringArray(parsed.recommendations) : fallback.recommendations,
      nextPeriodFocus: cleanStringArray(parsed.nextPeriodFocus).length ? cleanStringArray(parsed.nextPeriodFocus) : fallback.nextPeriodFocus,
    };
    return opts?.fields?.length ? mergeNarrative(fallback, generated, opts.fields) : generated;
  } catch (error) {
    console.error('[school-report] AI narrative unavailable; using factual fallback:', error instanceof Error ? error.message : error);
    return opts?.fields?.length ? mergeNarrative(fallback, fallback, opts.fields) : fallback;
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
