import OpenAI from 'openai';
import type { SchoolReportNarrative, SchoolReportSnapshot } from './types';

function fallbackNarrative(snapshot: SchoolReportSnapshot): SchoolReportNarrative {
  const { summary, curriculum } = snapshot;
  const achievements: string[] = [];
  const concerns: string[] = [];
  if (summary.averageScore >= 70) achievements.push(`Learners achieved a strong average score of ${summary.averageScore}%.`);
  if (summary.attendanceRate >= 80) achievements.push(`Attendance was strong at ${summary.attendanceRate}%.`);
  if (summary.curriculumCoverage >= 75) achievements.push(`${summary.curriculumCoverage}% of the selected curriculum range was completed.`);
  if (summary.averageScore > 0 && summary.averageScore < 50) concerns.push(`The average score of ${summary.averageScore}% shows that additional academic support is needed.`);
  if (summary.attendanceRate > 0 && summary.attendanceRate < 70) concerns.push(`Attendance of ${summary.attendanceRate}% may be limiting learner progress.`);
  if (summary.curriculumCoverage < 60) concerns.push(`Curriculum coverage is ${summary.curriculumCoverage}% for the selected range.`);
  if (!achievements.length) achievements.push(`${summary.submissionsReceived} pieces of learner work were captured during the reporting period.`);
  if (!concerns.length) concerns.push('Continue monitoring class-level differences so emerging gaps are addressed early.');
  return {
    executiveSummary: `${snapshot.school.name} recorded ${summary.activeStudents} active learners, an average score of ${summary.averageScore}%, attendance of ${summary.attendanceRate}%, and ${summary.curriculumCoverage}% curriculum coverage for the selected range. This report should be read with the data notes where records were incomplete.`,
    achievements,
    concerns,
    recommendations: [
      'Use the class comparison to direct coaching and revision support to the groups with the greatest need.',
      'Review missing score and attendance records before the next reporting cycle.',
      'Agree the next curriculum milestones with the responsible teachers and monitor them weekly.',
    ],
    nextPeriodFocus: [
      curriculum.inProgressWeeks ? `Complete the ${curriculum.inProgressWeeks} curriculum week(s) currently in progress.` : 'Start and record the next planned curriculum weeks.',
      'Increase evidence from graded learner work and attendance records.',
      'Celebrate strong classes while sharing their effective teaching practices.',
    ],
  };
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 6) : [];
}

export async function createSchoolReportNarrative(snapshot: SchoolReportSnapshot): Promise<SchoolReportNarrative> {
  const fallback = fallbackNarrative(snapshot);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fallback;
  const aggregateOnly = {
    school: snapshot.school.name,
    period: snapshot.period,
    summary: snapshot.summary,
    scoreBands: snapshot.scoreBands.map(({ label, count }) => ({ label, count })),
    attendanceBands: snapshot.attendanceBands.map(({ label, count }) => ({ label, count })),
    classPerformance: snapshot.classPerformance,
    programmeCoursePerformance: snapshot.programmeCoursePerformance,
    curriculum: snapshot.curriculum,
    dataNotes: snapshot.dataNotes,
  };
  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
  try {
    const response = await client.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      temperature: 0.25,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Write a concise, professional school performance report narrative using only the aggregate facts below. Do not invent causes, people, activities, or achievements. Mention missing data honestly. Use constructive language suitable for a school owner. Return JSON with keys executiveSummary (string), achievements (string[]), concerns (string[]), recommendations (string[]), nextPeriodFocus (string[]).\n\n${JSON.stringify(aggregateOnly)}`,
      }],
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    return {
      executiveSummary: String(parsed.executiveSummary || fallback.executiveSummary).trim().slice(0, 2400),
      achievements: cleanStringArray(parsed.achievements).length ? cleanStringArray(parsed.achievements) : fallback.achievements,
      concerns: cleanStringArray(parsed.concerns).length ? cleanStringArray(parsed.concerns) : fallback.concerns,
      recommendations: cleanStringArray(parsed.recommendations).length ? cleanStringArray(parsed.recommendations) : fallback.recommendations,
      nextPeriodFocus: cleanStringArray(parsed.nextPeriodFocus).length ? cleanStringArray(parsed.nextPeriodFocus) : fallback.nextPeriodFocus,
    };
  } catch (error) {
    console.error('[school-report] AI narrative unavailable; using factual fallback:', error instanceof Error ? error.message : error);
    return fallback;
  }
}

export { fallbackNarrative };
