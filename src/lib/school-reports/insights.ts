import type { SchoolReportSnapshot } from './types';

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
>;

/** Deterministic board-ready insights — partnership delivery report, not internal audit tooling. */
export function buildSchoolReportInsights(snapshot: InsightInput): SchoolReportInsights {
  const classes = (snapshot.classPerformance || []).filter((row) => row.students > 0);
  const scoredClasses = [...classes]
    .filter((row) => Number.isFinite(row.averageScore) && row.students > 0)
    .sort((a, b) => b.averageScore - a.averageScore);
  const top = scoredClasses[0] || null;
  const bottom = scoredClasses.length > 1 ? scoredClasses[scoredClasses.length - 1] : null;
  const scoreEquityGap =
    top && bottom ? Math.round(Math.max(0, top.averageScore - bottom.averageScore) * 10) / 10 : 0;

  const learners = Array.isArray(snapshot.learners) ? snapshot.learners : [];
  const atRiskLearners = learners.filter(
    (row) => row.status === 'Needs support' || row.status === 'Attendance risk',
  ).length;
  const extremeLearners = learners.filter(
    (row) =>
      (row.averageScore != null && row.averageScore < 35) ||
      (row.attendanceRate != null && row.attendanceRate < 50 && row.status === 'Attendance risk'),
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

  const learnerNextSteps = Array.from(
    new Set(
      learners
        .map((row) => row.nextStep?.trim())
        .filter(Boolean) as string[],
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

  academicCoverage.push(
    `${termLabel}: ${snapshot.summary.curriculumCoverage}% of planned curriculum delivered (${curriculum.completedWeeks}/${curriculum.plannedWeeks} weeks completed).`,
  );
  if (curriculum.inProgressWeeks > 0) {
    academicCoverage.push(
      `${curriculum.inProgressWeeks} curriculum week(s) actively in progress — continuity into the next module is underway.`,
    );
  }
  for (const course of (curriculum.courses || []).slice(0, 5)) {
    if (course.planned > 0 || course.completed > 0) {
      academicCoverage.push(
        `${course.programme} · ${course.course}: ${course.completed}/${course.planned} weeks completed (${course.coverage}% coverage).`,
      );
    }
  }
  for (const row of (snapshot.programmeCoursePerformance || []).slice(0, 5)) {
    academicCoverage.push(
      `${row.programme} — ${row.course}: ${row.students} learners tracked, term average ${row.averageScore}% from recorded evidence.`,
    );
  }
  if (manualResultCount > 0) {
    academicCoverage.push(
      `Term results captured for ${manualResultCount} learner(s) through Manual Result Entry — the academic picture reflects staff-entered work.`,
    );
  }

  if (manualResultCount > 0) {
    strengths.push(
      `Manual Result Entry covers ${manualResultCount} learner(s) — we followed staff-entered term results in this delivery report.`,
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
  if (snapshot.summary.attendanceRate >= 80) {
    strengths.push(`Attendance holds at ${snapshot.summary.attendanceRate}% (present + late).`);
  }
  if (snapshot.summary.curriculumCoverage >= 75) {
    strengths.push(`Curriculum delivery is on track at ${snapshot.summary.curriculumCoverage}% coverage.`);
  }
  if (top && top.averageScore >= 70) {
    strengths.push(
      `${top.className}${top.teacherName ? ` (${top.teacherName})` : ''} leads class performance at ${top.averageScore}%.`,
    );
  }
  if (excellentLearners > 0) {
    strengths.push(
      `${excellentLearners} learner(s) reached the Excellent band — worth celebrating with the school community.`,
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
      `Attendance at ${snapshot.summary.attendanceRate}% is critically low and needs a shared recovery plan with families.`,
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
  if (snapshot.summary.curriculumCoverage > 0 && snapshot.summary.curriculumCoverage < 60) {
    improvementAreas.push('Close open curriculum weeks and record week status weekly with assigned teachers.');
  }
  if (noEvidence > 0) {
    improvementAreas.push(`Capture remaining learner evidence for ${noEvidence} learner(s) still without term records.`);
  }

  partnershipFocus.push(
    `Rillcod and ${snapshot.school.name} will review this book together and agree one shared win and one shared focus for the next module.`,
  );
  if (snapshot.summary.curriculumCoverage >= 60 && snapshot.summary.curriculumCoverage < 90) {
    partnershipFocus.push(
      `Complete the remaining curriculum weeks together so ${termLabel} closes with strong academic continuity.`,
    );
  }
  if (developingLearners > 0) {
    partnershipFocus.push(
      `Support ${developingLearners} Developing learner(s) with short practice loops — we will track progress in the next snapshot.`,
    );
  }
  if (top) {
    partnershipFocus.push(
      `Document and spread what works in ${top.className} so every class benefits from proven teaching moves.`,
    );
  }
  if (teacherGrowthHints.length) {
    partnershipFocus.push(
      `Build on teacher-noted themes from result entry: ${teacherGrowthHints.slice(0, 2).join('; ')}.`,
    );
  }

  if (excellentLearners > 0) {
    growthAreas.push(
      `Celebrate ${excellentLearners} Excellent learner(s) as ambassadors of the school's progress this term.`,
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
  for (const course of inProgressCourses.slice(0, 2)) {
    nextModuleFocus.push(
      `Open the next module in ${course.programme} · ${course.course} — ${course.inProgress} week(s) already underway.`,
    );
  }
  if (curriculum.inProgressWeeks > 0 && !inProgressCourses.length) {
    nextModuleFocus.push(
      `Continue the ${curriculum.inProgressWeeks} curriculum week(s) in progress and record completion as teachers finish.`,
    );
  }
  for (const step of learnerNextSteps.slice(0, 3)) {
    nextModuleFocus.push(step);
  }
  for (const row of (snapshot.programmeCoursePerformance || [])
    .filter((item) => item.averageScore > 0 && item.averageScore < 55)
    .slice(0, 2)) {
    nextModuleFocus.push(
      `Strengthen ${row.programme} — ${row.course} with guided revision (${row.averageScore}% term average).`,
    );
  }
  if (!nextModuleFocus.length) {
    nextModuleFocus.push(
      'Begin the next planned curriculum module and refresh this report book early next term to celebrate gains.',
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
      const sample = rows.find((row) => row.nextStep)?.nextStep || rows[0].nextStep || '';
      return { band, count: rows.length, nextStep: sample };
    })
    .filter(Boolean) as SchoolReportInsights['nextPhaseLearners'];

  const nextPhaseSchool: SchoolReportInsights['nextPhaseSchool'] = [
    {
      phase: 'Closing this term',
      horizon: 'Finish strong together',
      actions: [
        ...partnershipFocus.slice(0, 2),
        academicCoverage[0] || `Review ${termLabel} delivery with school leadership.`,
      ].slice(0, 3),
    },
    {
      phase: 'Opening the next module',
      horizon: 'Coherent handover from learner reports',
      actions: nextModuleFocus.slice(0, 3),
    },
    {
      phase: 'Next term partnership',
      horizon: 'Stay detailed in delivery',
      actions: [
        ...growthAreas.slice(0, 2),
        'Refresh this report book early next term and celebrate gains in scores, attendance, and curriculum.',
      ].slice(0, 3),
    },
  ];

  const involvement = [
    'School leadership: review this delivery report and agree the next module focus with Rillcod.',
    "Assigned teachers: keep term results and attendance current so every learner's progress is visible.",
    'Learners: celebrate excellent work and stay engaged as the next module opens.',
    'Parents: partner on attendance and home practice when teachers reach out.',
    'Rillcod: continue detailed delivery tracking and refresh this snapshot after new entries.',
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
    evidenceLedger.push(`${manualResultCount} learner(s) scored through Manual Result Entry — teacher-entered term evidence.`);
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
            ? 'Partial'
            : 'Planned',
  }));

  const partnershipMilestones: string[] = [];
  if (curriculum.plannedWeeks > 0) {
    partnershipMilestones.push(
      `Curriculum window mapped: ${curriculum.completedWeeks}/${curriculum.plannedWeeks} weeks delivered (${snapshot.summary.curriculumCoverage}%).`,
    );
  }
  if (snapshot.summary.studentsWithScores > 0) {
    partnershipMilestones.push(`${snapshot.summary.studentsWithScores} learners with term academic records on file.`);
  }
  if (snapshot.summary.attendanceRate > 0) {
    partnershipMilestones.push(`Attendance captured at ${snapshot.summary.attendanceRate}% (present + late).`);
  }
  if ((snapshot.staff?.assignedTeachers || 0) > 0) {
    partnershipMilestones.push(`${snapshot.staff?.assignedTeachers} teacher(s) actively linked to this school.`);
  }
  if (snapshot.finance.attached) {
    partnershipMilestones.push('Term invoice aligned with this delivery report.');
  }
  if (manualResultCount > 0) {
    partnershipMilestones.push('Manual Result Entry completed for part of the learner cohort.');
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
  const deliveryCommitment = {
    planned: [
      `Curriculum window: ${curriculumRange}.`,
      programmeNames.length
        ? `${programmeNames.length} programme(s): ${programmeNames.slice(0, 4).join(', ')}.`
        : `${curriculum.plannedWeeks} curriculum week(s) planned for ${termLabel}.`,
    ],
    delivered: [
      `${curriculum.completedWeeks}/${curriculum.plannedWeeks} curriculum weeks completed (${snapshot.summary.curriculumCoverage}%).`,
      `${snapshot.summary.studentsWithScores}/${snapshot.summary.activeStudents} learners with term scores.`,
      `${snapshot.summary.submissionsReceived} submission(s) and ${snapshot.summary.assignmentsCreated} assignment(s) on record.`,
    ],
    next: nextModuleFocus.slice(0, 3),
  };
  if (!deliveryCommitment.next.length) {
    deliveryCommitment.next.push('Open the next planned module and refresh this book early next term.');
  }

  const celebrationWall = learners
    .filter((row) => row.status === 'Excellent')
    .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))
    .slice(0, 5)
    .map((row) => ({
      name: row.name,
      className: row.className,
      highlight:
        row.keyStrengths?.[0] ||
        row.nextStep ||
        (row.averageScore != null ? `${row.averageScore}% term average — excellent progress.` : 'Excellent progress this term.'),
    }));

  const learnerHighlights = learners
    .flatMap((row) =>
      (row.keyStrengths || []).slice(0, 1).map((strength) => `${row.name} (${row.className}): ${strength}`),
    )
    .slice(0, 6);
  if (!learnerHighlights.length && celebrationWall.length) {
    for (const row of celebrationWall.slice(0, 3)) {
      learnerHighlights.push(`${row.name} (${row.className}): ${row.highlight}`);
    }
  }

  const programmeRows = snapshot.programmeCoursePerformance || [];
  const spotlightRow =
    programmeRows.length > 0
      ? [...programmeRows].sort((a, b) => b.students - a.students || b.averageScore - a.averageScore)[0]
      : null;
  const spotlightCourse = spotlightRow
    ? (curriculum.courses || []).find(
        (row) => row.programme === spotlightRow.programme && row.course === spotlightRow.course,
      )
    : (curriculum.courses || [])[0] || null;
  const programmeSpotlight = spotlightRow
    ? {
        programme: spotlightRow.programme,
        course: spotlightRow.course,
        summary: `${spotlightRow.students} learners tracked · ${spotlightRow.submissions} submission(s) · ${spotlightRow.averageScore}% term average.`,
        nextIntro: spotlightCourse?.inProgress
          ? `Next module continues ${spotlightRow.programme} · ${spotlightRow.course} with ${spotlightCourse.inProgress} week(s) already underway.`
          : `Next module opens fresh work in ${spotlightRow.programme} · ${spotlightRow.course} — aligned with learner report themes.`,
      }
    : spotlightCourse
      ? {
          programme: spotlightCourse.programme,
          course: spotlightCourse.course,
          summary: `${spotlightCourse.completed}/${spotlightCourse.planned} weeks completed (${spotlightCourse.coverage}% coverage) this term.`,
          nextIntro: `Continue ${spotlightCourse.programme} · ${spotlightCourse.course} as the next module builds on this term's foundation.`,
        }
      : null;

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

  const winLine =
    strengths[0] ||
    `${snapshot.summary.activeStudents} learners actively tracked through ${termLabel}.`;
  const coverageLine =
    academicCoverage[0] || `${snapshot.summary.curriculumCoverage}% curriculum delivered this term.`;
  const nextLine =
    nextModuleFocus[0] || 'The next module opens with clear learner goals drawn from this term\'s evidence.';
  const communityMessage = [
    `Dear ${snapshot.school.name} community,`,
    `Rillcod Technologies is pleased to share our ${termLabel} delivery report.`,
    winLine.replace(/\.$/, '') + '.',
    coverageLine.replace(/\.$/, '') + '.',
    `Looking ahead: ${nextLine.replace(/\.$/, '')}.`,
    'Thank you for partnering with us — together we keep every learner visible, supported, and ready for what comes next.',
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
    priorities: priorities.slice(0, 4),
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
    moduleCoverage: moduleCoverage.slice(0, 12),
    partnershipMilestones: partnershipMilestones.slice(0, 6),
    deliveryCommitment,
    celebrationWall,
    learnerHighlights: learnerHighlights.slice(0, 6),
    communityMessage,
    programmeSpotlight,
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
  if (snapshot.insights && deliveryInsightsComplete(snapshot.insights)) {
    return snapshot.insights;
  }
  return buildSchoolReportInsights(snapshot);
}
