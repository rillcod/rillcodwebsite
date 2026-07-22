import type { SchoolReportSnapshot } from './types';
import { buildDeliveredTopicsSummary, buildTopicsCoveredDraft } from './delivered-topics';
import { buildDeliveryLedger } from './delivery-structure';
import { DEFAULT_SCHOOL_REPORT_POLICY } from './report-policy';
import { programmeCourseKey } from './school-curriculum-scope';
import { bandCoachingMessage, describeSchoolAttendance } from './student-recommendations';

import { dedupeStringList } from './report-content-dedup';

function dedupeInsightActions(items: string[]): string[] {
  return dedupeStringList(items, [], 6);
}

export type SchoolReportInsights = NonNullable<SchoolReportSnapshot['insights']>;

type InsightInput = Pick<
  SchoolReportSnapshot,
  | 'school'
  | 'summary'
  | 'classPerformance'
  | 'learners'
  | 'staff'
  | 'curriculum'
  | 'finance'
  | 'period'
  | 'programmeCoursePerformance'
  | 'deliveryDeclaration'
  | 'reportPolicy'
>;

/** Deterministic board-ready insights — partnership delivery report, not internal audit tooling. */
export function buildSchoolReportInsights(snapshot: InsightInput): SchoolReportInsights {
  const reportPolicy = snapshot.reportPolicy || DEFAULT_SCHOOL_REPORT_POLICY;
  const classes = (snapshot.classPerformance || []).filter((row) => row.students > 0);
  const scoredClasses = [...classes]
    .filter((row) => Number.isFinite(row.averageScore) && row.students > 0)
    .sort((a, b) => b.averageScore - a.averageScore);
  const top = scoredClasses[0] || null;
  const bottom = scoredClasses.length > 1 ? scoredClasses[scoredClasses.length - 1] : null;
  const topClassLabel = top?.className.split(' · ').slice(-2).join(' · ') || top?.className || 'the leading class';
  const scoreEquityGap =
    top && bottom ? Math.round(Math.max(0, top.averageScore - bottom.averageScore) * 10) / 10 : 0;

  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const atRiskLearners = learners.filter(
    (row) => row.status === 'Needs support' || row.status === 'Attendance risk',
  ).length;
  const extremeLearners = learners.filter(
    (row) =>
      (row.averageScore != null && row.averageScore < 35) ||
      (row.attendanceRate != null && row.attendanceRate < reportPolicy.attendance.riskBelow && row.status === 'Attendance risk'),
  ).length;
  const excellentLearners = learners.filter((row) => row.status === 'Excellent').length;
  const developingLearners = learners.filter((row) => row.status === 'Developing').length;
  const noEvidence = learners.filter((row) => row.status === 'No evidence').length;
  const manualResultCount = learners.filter((row) => row.scoreSource === 'manual_result').length;
  const manualRollCount = learners.filter((row) => row.attendanceSource === 'manual_roll').length;

  const classesWithTeacher = classes.filter((row) => Boolean(row.teacherId || row.teacherName)).length;
  const classesTotal = classes.length;
  const teacherCoveragePct = classesTotal
    ? Math.round((classesWithTeacher / classesTotal) * 100)
    : 0;

  const evidenceDenom = Math.max(1, snapshot.summary.activeStudents);
  const evidenceQualityPct = Math.round(
    (snapshot.summary.studentsWithScores / evidenceDenom) * 100,
  );

  const teacherGrowthHints = Array.from(
    new Set(
      learners
        .flatMap((row) => row.growthHints || [])
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);

  const strengths: string[] = [];
  const risks: string[] = [];
  const priorities: string[] = [];
  const growthAreas: string[] = [];
  const improvementAreas: string[] = [];
  const academicCoverage: string[] = [];
  const partnershipFocus: string[] = [];
  const nextModuleFocus: string[] = [];

  const termLabel = snapshot.period?.termLabel || 'this term';
  const { curriculum } = snapshot;
  const deliveredTopics = buildDeliveredTopicsSummary(snapshot);

  academicCoverage.push(...(
    snapshot.deliveryDeclaration?.selectedTopics?.length
      ? []
      : deliveredTopics.summaryLines.slice(0, 8)
  ));
  if (curriculum.plannedWeeks > 0 && !deliveredTopics.topics.length) {
    academicCoverage.push(
      `${termLabel}: ${snapshot.summary.curriculumCoverage}% of the mapped curriculum window (${curriculum.completedWeeks}/${curriculum.plannedWeeks} weeks marked complete).`,
    );
  }
  if (curriculum.inProgressWeeks > 0 && deliveredTopics.topics.length <= 2) {
    academicCoverage.push(
      `${curriculum.inProgressWeeks} curriculum week(s) actively in progress — continuity into the next module is underway.`,
    );
  }
  if (manualResultCount > 0) {
    academicCoverage.push(
      `Verified term assessments cover ${manualResultCount} learner(s), providing a clear academic picture from teacher-recorded evidence.`,
    );
  }

  if (manualResultCount > 0) {
    strengths.push(
      `Verified term assessments cover ${manualResultCount} learner(s) in this report.`,
    );
  }
  if (manualRollCount > 0) {
    strengths.push(
      `Attendance rolls cover ${manualRollCount} learner(s) for ${termLabel}.`,
    );
  }
  if (snapshot.summary.averageScore >= 70) {
    strengths.push(`School-wide average score is strong at ${snapshot.summary.averageScore}%.`);
  }
  if (snapshot.summary.attendanceRate >= reportPolicy.attendance.strongMin) {
    strengths.push(describeSchoolAttendance(snapshot));
  }
  if (snapshot.summary.curriculumCoverage >= reportPolicy.grading.excellentMin) {
    strengths.push(`Curriculum delivery is on track at ${snapshot.summary.curriculumCoverage}% coverage.`);
  }
  if (top && top.averageScore >= 70) {
    strengths.push(
      `${top.className}${top.teacherName ? ` (${top.teacherName})` : ''} leads class performance at ${top.averageScore}%.`,
    );
  }
  if (excellentLearners > 0) {
    strengths.push(
      `${excellentLearners} learner(s) reached the Excellent band this term.`,
    );
  }
  if ((snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers) > 0) {
    strengths.push(
      `${snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers} teacher(s) served this school during the period.`,
    );
  }

  // Risks: only extreme school-wide or critical learner cases — not routine coaching counts.
  if (snapshot.summary.averageScore > 0 && snapshot.summary.averageScore < 45) {
    risks.push(
      `School-wide average of ${snapshot.summary.averageScore}% needs urgent joint support — Rillcod and the school should align immediately.`,
    );
  }
  if (snapshot.summary.attendanceRate > 0 && snapshot.summary.attendanceRate < 55) {
    risks.push(
      `${describeSchoolAttendance(snapshot)} A shared recovery plan with families is needed.`,
    );
  }
  if (extremeLearners >= 2) {
    risks.push(
      `${extremeLearners} learner(s) show critically low scores or attendance — agree immediate, named support with class teachers.`,
    );
  }

  // Internal improvementAreas (staff builder) — not copied verbatim to the school PDF.
  if (scoreEquityGap >= 20) {
    improvementAreas.push(
      `Share effective practices from ${top?.className || 'leading classes'} with ${bottom?.className || 'other classes'}.`,
    );
  }
  if (snapshot.summary.curriculumCoverage > 0 && snapshot.summary.curriculumCoverage < reportPolicy.attendance.riskBelow) {
    improvementAreas.push('Close open curriculum weeks and record week status weekly with assigned teachers.');
  }
  if (noEvidence > 0) {
    improvementAreas.push(`Capture remaining learner evidence for ${noEvidence} learner(s) still without term records.`);
  }

  if (developingLearners > 0) {
    partnershipFocus.push(
      `Give ${developingLearners} Developing learner(s) guided practice; Rillcod and teachers will compare their next recorded result.`,
    );
  }
  if (snapshot.summary.attendanceRate > 0 && snapshot.summary.attendanceRate < 90) {
    partnershipFocus.push(
      `${describeSchoolAttendance(snapshot)} The school and families will reinforce consistent participation while Rillcod monitors the next snapshot.`,
    );
  }
  if (snapshot.summary.curriculumCoverage < 90) {
    partnershipFocus.push(
      'Confirm delivered topics for each programme before the next report so coverage matches completed classwork.',
    );
  }
  if (top) {
    partnershipFocus.push(
      `Reuse one practice from ${topClassLabel} in other classes; compare averages at the next review.`,
    );
  }
  if (teacherGrowthHints.length) {
    partnershipFocus.push(
      `Use the teacher-noted themes - ${teacherGrowthHints.slice(0, 2).join('; ')} - to plan the next guided practice tasks.`,
    );
  }
  if (!partnershipFocus.length) {
    partnershipFocus.push(
      `Rillcod and ${snapshot.school.name} will agree one measurable learner goal and review it in the next report snapshot.`,
    );
  }

  if (excellentLearners > 0) {
    growthAreas.push(
      `${excellentLearners} Excellent learner(s) can model expected standards for peers in the next module cycle.`,
    );
  }
  if (curriculum.inProgressWeeks > 0) {
    growthAreas.push(
      `Carry ${curriculum.inProgressWeeks} in-progress curriculum week(s) smoothly into the opening module of the next phase.`,
    );
  }
  if (top) {
    growthAreas.push(`Highlight ${top.className} in the school's end-of-term communication.`);
  }
  if (!growthAreas.length) {
    growthAreas.push("Keep building rich term evidence so each learner's story stays visible in the next book.");
  }

  const inProgressCourses = (curriculum.courses || []).filter((row) => row.inProgress > 0);
  for (const course of inProgressCourses) {
    nextModuleFocus.push(
      `Open the next module in ${course.programme} · ${course.course} — ${course.inProgress} week(s) already underway.`,
    );
  }
  if (curriculum.inProgressWeeks > 0 && !inProgressCourses.length) {
    nextModuleFocus.push(
      `Continue the ${curriculum.inProgressWeeks} curriculum week(s) in progress and record completion as teachers finish.`,
    );
  }
  for (const row of (snapshot.programmeCoursePerformance || [])
    .filter((item) => item.averageScore > 0 && item.averageScore < 55)) {
    nextModuleFocus.push(
      `Strengthen ${row.programme} — ${row.course} with guided revision (${row.averageScore}% term average).`,
    );
  }
  if (!nextModuleFocus.length) {
    nextModuleFocus.push(
      'Open the next planned curriculum module and refresh this report book at the start of next term.',
    );
  }

  if (bottom && scoreEquityGap >= 15) {
    priorities.push(
      `Coach ${bottom.className}${bottom.teacherName ? ` with ${bottom.teacherName}` : ''} using practices from the leading class.`,
    );
  }
  if (curriculum.inProgressWeeks > 0) {
    priorities.push(`Close out the ${curriculum.inProgressWeeks} curriculum week(s) currently in progress.`);
  }
  priorities.push(...nextModuleFocus.slice(0, 2));
  if (!priorities.length) {
    priorities.push('Maintain current standards and document what is working for peer sharing across classes.');
  }

  if (!strengths.length) {
    strengths.push(
      `${snapshot.summary.submissionsReceived} evidence item(s) and term records form the base of this delivery report.`,
    );
  }
  if (!improvementAreas.length) {
    improvementAreas.push('Keep term results and attendance current so each learner stays visible in the next book.');
  }

  const bandOrder = [
    'Needs support',
    'Attendance risk',
    'Developing',
    'On track',
    'Excellent',
    'No evidence',
  ] as const;
  const nextPhaseLearners = bandOrder
    .map((band) => {
      const rows = learners.filter((row) => row.status === band);
      if (!rows.length) return null;
      return { band, count: rows.length, nextStep: bandCoachingMessage(band) };
    })
    .filter(Boolean) as SchoolReportInsights['nextPhaseLearners'];

  const nextPhaseSchool: SchoolReportInsights['nextPhaseSchool'] = [
    {
      phase: 'Term close',
      horizon: snapshot.period?.termLabel || termLabel,
      actions: dedupeInsightActions([
        ...partnershipFocus.slice(0, 2),
        academicCoverage[0] || `Confirm ${termLabel} delivery with school leadership.`,
      ]).slice(0, 3),
    },
    {
      phase: 'Next module',
      horizon: 'Handover from this report',
      actions: dedupeInsightActions(nextModuleFocus.slice(0, 3)),
    },
    {
      phase: 'Next term review',
      horizon: 'Agreed priorities with leadership',
      actions: dedupeInsightActions([
        ...growthAreas.slice(0, 2),
        'Refresh this report book at the start of next term with updated learner evidence.',
      ]).slice(0, 3),
    },
  ];

  const involvement = [
    'School leadership: review this report and agree the next module focus with Rillcod.',
    'Teachers: keep term results and attendance current so learner progress stays visible.',
    'Learners: complete assigned practice tasks before the next module opens.',
    'Parents: support attendance and follow-up on teacher feedback where requested.',
    'Rillcod: maintain delivery tracking and refresh the snapshot after new entries.',
  ];

  const evidenceLedger: string[] = [];
  if (snapshot.summary.assignmentsCreated > 0) {
    evidenceLedger.push(`${snapshot.summary.assignmentsCreated} assignment(s) set for learners this term.`);
  }
  if (snapshot.summary.submissionsReceived > 0) {
    evidenceLedger.push(`${snapshot.summary.submissionsReceived} piece(s) of learner work captured in the gradebook.`);
  }
  evidenceLedger.push(
    `${snapshot.summary.studentsWithScores} of ${snapshot.summary.activeStudents} learners have term scores on record (${evidenceQualityPct}% evidence depth).`,
  );
  if (manualResultCount > 0) {
    evidenceLedger.push(`${manualResultCount} learner(s) have scores supported by teacher-recorded assessment evidence.`);
  }
  if (manualRollCount > 0) {
    evidenceLedger.push(`${manualRollCount} learner(s) tracked through the manual attendance roll.`);
  }
  if (!evidenceLedger.length) {
    evidenceLedger.push('Refresh learner evidence early next term so every child stays visible in the delivery book.');
  }

  const teacherDelivery = (snapshot.staff?.teachers || []).map((teacher) => {
    const classes =
      teacher.classNames.length > 3
        ? `${teacher.classNames.slice(0, 3).join(', ')} +${teacher.classNames.length - 3} more`
        : teacher.classNames.join(', ') || 'classes assigned';
    return `${teacher.name}: ${teacher.classCount} class(es) — ${classes}`;
  });
  if (!teacherDelivery.length && (snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers) > 0) {
    teacherDelivery.push(
      `${snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers} teacher(s) served ${snapshot.school.name} during ${termLabel}.`,
    );
  }

  const moduleCoverage = (curriculum.courses || []).map((course) => ({
    programme: course.programme,
    course: course.course,
    completed: course.completed,
    planned: course.planned,
    coverage: course.coverage,
    status:
      course.inProgress > 0
        ? 'In progress'
        : course.planned > 0 && course.completed >= course.planned
          ? 'Complete'
          : course.completed > 0
            ? 'Focused delivery'
            : 'Planned',
  }));

  const partnershipMilestones: string[] = [];
  if (snapshot.summary.studentsWithScores > 0) {
    partnershipMilestones.push(`${snapshot.summary.studentsWithScores} learners with term academic records on file.`);
  }
  if (snapshot.summary.attendanceRate > 0) {
    partnershipMilestones.push(describeSchoolAttendance(snapshot));
  }
  if ((snapshot.staff?.assignedTeachers || 0) > 0) {
    partnershipMilestones.push(`${snapshot.staff?.assignedTeachers} teacher(s) actively linked to this school.`);
  }
  if (snapshot.finance.attached) {
    partnershipMilestones.push('Term invoice aligned with this delivery report.');
  }
  if (manualResultCount > 0) {
    partnershipMilestones.push('Verified term assessments are available for part of the learner cohort.');
  }
  if (deliveredTopics.topics.length > 0) {
    partnershipMilestones.push(
      `${deliveredTopics.topics.length} topic area${deliveredTopics.topics.length === 1 ? '' : 's'} evidenced through teaching and results.`,
    );
  }
  if (!partnershipMilestones.length) {
    partnershipMilestones.push(`Delivery book opened for ${termLabel} — continue building evidence together.`);
  }

  const curriculumRange =
    snapshot.period?.curriculumStart && snapshot.period?.curriculumEnd
      ? `Term ${snapshot.period.curriculumStart.term} Week ${snapshot.period.curriculumStart.week} – Term ${snapshot.period.curriculumEnd.term} Week ${snapshot.period.curriculumEnd.week}`
      : termLabel;
  const programmeNames = Array.from(
    new Set((curriculum.courses || []).map((row) => row.programme).filter(Boolean)),
  );
  const deliveryLedger = buildDeliveryLedger(snapshot, {
    nextLines: nextModuleFocus.slice(0, 4),
    curriculumRange,
    programmeNames,
    evidenceQualityPct,
    manualResultCount,
    manualRollCount,
  });
  const deliveryCommitment = {
    planned: deliveryLedger.plannedLines,
    delivered: deliveryLedger.evidenceLines,
    next: deliveryLedger.nextLines,
  };

  const celebrationWall = learners
    .filter((row) => row.status === 'Excellent' || (row.averageScore != null && row.averageScore >= 70))
    .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      className: row.className,
      highlight: row.averageScore != null ? `${row.averageScore}% term average` : 'Strong term progress',
    }));

  const celebrationStudentIds = new Set(celebrationWall.map((c) => c.id || c.name));

  // Learner highlights: distinct learners NOT already featured on the Celebration Wall
  const learnerHighlights = learners
    .filter((row) => !celebrationStudentIds.has(row.id) && !celebrationStudentIds.has(row.name))
    .filter((row) => row.averageScore != null || (row.keyStrengths?.length ?? 0) > 0)
    .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))
    .slice(0, 4)
    .map((row) => {
      const result = row.averageScore != null ? `${row.averageScore}% term average` : 'Progress recorded';
      return `${row.name} (${row.className}): ${result}`;
    });

  const programmeRows = snapshot.programmeCoursePerformance || [];
  const curriculumCourses = curriculum.courses || [];
  const spotlightSeen = new Set<string>();

  function buildSpotlight(
    programme: string,
    course: string,
    summary: string,
    nextIntro: string,
  ) {
    const key = programmeCourseKey(programme, course);
    if (spotlightSeen.has(key)) return null;
    spotlightSeen.add(key);
    return { programme, course, summary, nextIntro };
  }

  const programmeSpotlights: Array<{
    programme: string;
    course: string;
    summary: string;
    nextIntro: string;
  }> = [];

  for (const row of [...programmeRows].sort(
    (a, b) => b.students - a.students || b.averageScore - a.averageScore || a.course.localeCompare(b.course),
  )) {
    if (row.students <= 0 && row.submissions <= 0) continue;
    const curriculumCourse = curriculumCourses.find(
      (item) => programmeCourseKey(item.programme, item.course) === programmeCourseKey(row.programme, row.course),
    );
    const entry = buildSpotlight(
      row.programme,
      row.course,
      `${row.students} learners tracked · ${row.submissions} submission(s) · ${row.averageScore}% term average.`,
      curriculumCourse?.inProgress
        ? `Next module continues ${row.programme} · ${row.course} with ${curriculumCourse.inProgress} week(s) already underway.`
        : `Next module opens fresh work in ${row.programme} · ${row.course} — aligned with learner report themes.`,
    );
    if (entry) programmeSpotlights.push(entry);
  }

  for (const course of curriculumCourses) {
    if (course.planned <= 0 && course.completed <= 0 && course.inProgress <= 0) continue;
    const entry = buildSpotlight(
      course.programme,
      course.course,
      `${course.completed}/${course.planned} weeks completed (${course.coverage}% coverage) this term.`,
      course.inProgress
        ? `Continue ${course.programme} · ${course.course} — ${course.inProgress} week(s) already in progress.`
        : `Continue ${course.programme} · ${course.course} as the next module builds on this term's foundation.`,
    );
    if (entry) programmeSpotlights.push(entry);
  }

  const programmeSpotlight = programmeSpotlights[0] ?? null;

  const reviewDate = snapshot.period?.endDate ? new Date(snapshot.period.endDate) : null;
  if (reviewDate && !Number.isNaN(reviewDate.getTime())) {
    reviewDate.setDate(reviewDate.getDate() + 14);
  }
  const suggestedPartnershipReview = reviewDate && !Number.isNaN(reviewDate.getTime())
    ? `Suggested joint review with school leadership: ${reviewDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })} (within two weeks of term close).`
    : 'Schedule a brief joint review with school leadership early next term to agree the next module focus.';

  const participationPrompt = snapshot.summary.attendanceRate > 0
    ? 'Families can reinforce learning by asking learners to explain one concept each week and by supporting regular attendance.'
    : 'Families can reinforce learning by asking learners to explain one concept each week and by supporting regular attendance.';
  const communityMessage = [
    `${snapshot.school.name} completed structured STEM delivery with Rillcod during ${termLabel}.`,
    participationPrompt,
  ].join(' ');

  const headlineParts = [
    `${snapshot.school.name} — ${termLabel} delivery report`,
    `${snapshot.summary.activeStudents} learners`,
    `avg ${snapshot.summary.averageScore}%`,
    `attendance ${snapshot.summary.attendanceRate}%`,
    `curriculum ${snapshot.summary.curriculumCoverage}%`,
  ];
  if (manualResultCount > 0) headlineParts.push(`${manualResultCount} learners with term results`);

  return {
    headline: `${headlineParts.join(' · ')}.`,
    strengths: strengths.slice(0, 5),
    risks: risks.slice(0, 3),
    priorities: priorities.slice(0, reportPolicy.display.maxRecommendations),
    growthAreas: growthAreas.slice(0, 5),
    improvementAreas: improvementAreas.slice(0, 5),
    academicCoverage: academicCoverage.slice(0, 6),
    partnershipFocus: partnershipFocus.slice(0, 5),
    nextModuleFocus: nextModuleFocus.slice(0, 5),
    nextPhaseSchool,
    nextPhaseLearners,
    involvement,
    evidenceLedger: evidenceLedger.slice(0, 5),
    teacherDelivery: teacherDelivery.slice(0, 8),
    moduleCoverage: moduleCoverage.slice(0, reportPolicy.display.maxChartRows),
    deliveredTopics: deliveredTopics.topics,
    deliveryPathNote: deliveredTopics.deliveryPathNote,
    topicsProseSeed: snapshot.deliveryDeclaration?.selectedTopics?.length
      ? undefined
      : buildTopicsCoveredDraft(snapshot) || deliveredTopics.proseSeed,
    partnershipMilestones: partnershipMilestones.slice(0, 6),
    deliveryCommitment,
    deliveryLedger,
    celebrationWall,
    learnerHighlights: learnerHighlights.slice(0, 3),
    communityMessage,
    programmeSpotlight,
    programmeSpotlights,
    suggestedPartnershipReview,
    topClass: top
      ? { className: top.className, teacherName: top.teacherName, averageScore: top.averageScore }
      : null,
    bottomClass: bottom
      ? {
          className: bottom.className,
          teacherName: bottom.teacherName,
          averageScore: bottom.averageScore,
        }
      : null,
    scoreEquityGap,
    atRiskLearners,
    excellentLearners,
    classesWithTeacher,
    classesTotal,
    teacherCoveragePct,
    evidenceQualityPct,
  };
}

function deliveryInsightsComplete(insights: SchoolReportInsights | null | undefined): boolean {
  if (!insights) return false;
  const dc = insights.deliveryCommitment;
  return Boolean(dc && (dc.planned?.length || dc.delivered?.length || dc.next?.length));
}

/** Recompute partnership insights when a frozen snapshot predates newer delivery fields. */
export function resolveSchoolReportInsights(
  snapshot: InsightInput & { insights?: SchoolReportInsights | null },
): SchoolReportInsights {
  const fresh = buildSchoolReportInsights(snapshot);
  if (snapshot.deliveryDeclaration?.selectedTopics?.length) {
    return fresh;
  }
  if (!snapshot.insights || !deliveryInsightsComplete(snapshot.insights)) {
    return fresh;
  }
  if (snapshot.insights.topicsProseSeed && snapshot.insights.deliveryLedger) {
    return {
      ...snapshot.insights,
      communityMessage: fresh.communityMessage,
      partnershipFocus: fresh.partnershipFocus,
    };
  }
  const delivered = buildDeliveredTopicsSummary(snapshot);
  return {
    ...snapshot.insights,
    academicCoverage: fresh.academicCoverage,
    deliveryCommitment: fresh.deliveryCommitment,
    deliveryLedger: fresh.deliveryLedger,
    deliveredTopics: delivered.topics.slice(0, 8),
    deliveryPathNote: delivered.deliveryPathNote,
    topicsProseSeed: snapshot.deliveryDeclaration?.selectedTopics?.length
      ? undefined
      : buildTopicsCoveredDraft(snapshot) || delivered.proseSeed,
    communityMessage: fresh.communityMessage,
  };
}
