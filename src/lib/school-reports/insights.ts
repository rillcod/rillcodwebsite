import type { SchoolReportSnapshot } from './types';

export type SchoolReportInsights = NonNullable<SchoolReportSnapshot['insights']>;

/** Deterministic board-ready insights — growth + progressive involvement, not just rankings. */
export function buildSchoolReportInsights(
  snapshot: Pick<
    SchoolReportSnapshot,
    'school' | 'summary' | 'classPerformance' | 'learners' | 'staff' | 'curriculum' | 'finance' | 'period'
  >,
): SchoolReportInsights {
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

  if (manualResultCount > 0) {
    strengths.push(
      `Manual Result Entry covers ${manualResultCount} learner(s) — academic figures follow staff-entered term results first.`,
    );
  }
  if (manualRollCount > 0) {
    strengths.push(
      `Manual attendance roll covers ${manualRollCount} learner(s) for ${snapshot.period?.termLabel || 'this term'}.`,
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
    strengths.push(`${excellentLearners} learner(s) are in the Excellent band — ready for stretch leadership.`);
  }
  if ((snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers) > 0) {
    strengths.push(
      `${snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers} teacher(s) are assigned to this school (not platform-wide).`,
    );
  }

  if (snapshot.summary.averageScore > 0 && snapshot.summary.averageScore < 50) {
    risks.push(`Average score of ${snapshot.summary.averageScore}% signals need for structured academic support.`);
    improvementAreas.push('Stand up a fortnightly recovery clinic for learners below 50% overall.');
  }
  if (snapshot.summary.attendanceRate > 0 && snapshot.summary.attendanceRate < 70) {
    risks.push(`Attendance at ${snapshot.summary.attendanceRate}% may be limiting learning time.`);
    improvementAreas.push('Run a same-day absence follow-up routine with class teachers and parents.');
  }
  if (scoreEquityGap >= 20) {
    risks.push(
      `Class equity gap is ${scoreEquityGap} points between strongest and weakest class — uneven delivery risk.`,
    );
    improvementAreas.push(
      `Peer-coach ${bottom?.className || 'the trailing class'} using methods from ${top?.className || 'the leading class'}.`,
    );
  }
  if (atRiskLearners > 0) {
    risks.push(`${atRiskLearners} learner(s) need support or attendance intervention.`);
    improvementAreas.push(`Publish a named recovery list of ${atRiskLearners} learner(s) with owners and dates.`);
  }
  if (teacherCoveragePct < 100 && classesTotal > 0) {
    risks.push(`Only ${teacherCoveragePct}% of classes have an assigned class teacher on record.`);
    improvementAreas.push('Assign a class teacher to every active class before the next snapshot.');
  }
  if (evidenceQualityPct < 60 && snapshot.summary.activeStudents > 0) {
    risks.push(
      `Only ${evidenceQualityPct}% of learners have academic evidence — complete Manual Result Entry / gradebook.`,
    );
    improvementAreas.push('Finish Manual Result Entry for every active learner in this term.');
  }
  if (noEvidence > 0) {
    improvementAreas.push(`Clear the ${noEvidence} learner(s) still showing “No evidence” by marking attendance and results.`);
  }
  if (snapshot.summary.curriculumCoverage > 0 && snapshot.summary.curriculumCoverage < 60) {
    risks.push(`Curriculum coverage is ${snapshot.summary.curriculumCoverage}% for the selected range.`);
    improvementAreas.push('Close open curriculum weeks and record week status weekly with assigned teachers.');
  }
  if (!snapshot.finance?.attached) {
    risks.push('No matching school invoice is attached for this term — commercial appendix incomplete.');
    improvementAreas.push('Generate or label the school invoice for this term in School Billing, then refresh.');
  }

  // Growth = ambitious, involving opportunities (not only deficit language)
  if (excellentLearners > 0) {
    growthAreas.push(
      `Turn ${excellentLearners} Excellent learner(s) into peer mentors and showcase ambassadors for the school brand.`,
    );
  }
  if (developingLearners > 0) {
    growthAreas.push(
      `Move ${developingLearners} Developing learner(s) into On track with short practice loops and weekly shout-outs.`,
    );
  }
  if (top) {
    growthAreas.push(
      `Document what works in ${top.className} and roll it across other classes this term.`,
    );
  }
  if (snapshot.summary.curriculumCoverage >= 60 && snapshot.summary.curriculumCoverage < 90) {
    growthAreas.push('Push curriculum coverage toward 90%+ and celebrate completed weeks with the school community.');
  }
  if (teacherGrowthHints.length) {
    growthAreas.push(`Teacher-noted growth themes from result entry: ${teacherGrowthHints.slice(0, 3).join('; ')}.`);
  }
  growthAreas.push(
    'Host a short “report conversation” with school leadership using this book — agree one shared win and one shared focus.',
  );
  if (!growthAreas.length) {
    growthAreas.push('Build richer Manual Result Entry and attendance so the next book can coach the school more personally.');
  }

  if (bottom && scoreEquityGap >= 15) {
    priorities.push(
      `Coach ${bottom.className}${bottom.teacherName ? ` with ${bottom.teacherName}` : ''} using practices from the leading class.`,
    );
  }
  if (atRiskLearners > 0) {
    priorities.push(`Run a targeted recovery plan for the ${atRiskLearners} flagged learner(s) this fortnight.`);
  }
  if (snapshot.curriculum.inProgressWeeks > 0) {
    priorities.push(`Close out the ${snapshot.curriculum.inProgressWeeks} curriculum week(s) currently in progress.`);
  }
  if (evidenceQualityPct < 80) {
    priorities.push('Raise Manual Result Entry / grade capture so the next book rests on fuller evidence.');
  }
  if (!priorities.length) {
    priorities.push('Maintain current standards and document what is working for peer sharing across classes.');
  }
  if (!strengths.length) {
    strengths.push(
      `${snapshot.summary.submissionsReceived} evidence item(s) and Manual Result Entry/attendance rolls form the base for this book.`,
    );
  }
  if (!risks.length) {
    risks.push('No critical risks flagged from the current snapshot — keep monitoring class-level variance.');
  }
  if (!improvementAreas.length) {
    improvementAreas.push('Keep Manual Result Entry and class attendance current every week so coaching stays personal.');
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
      phase: 'Phase 1 — This fortnight',
      horizon: 'Immediate involvement',
      actions: [
        ...priorities.slice(0, 2),
        atRiskLearners
          ? `Teachers + school meet on the ${atRiskLearners} at-risk learner(s) and message parents where needed.`
          : 'Share one class win with learners in assembly or the parent channel.',
      ].slice(0, 3),
    },
    {
      phase: 'Phase 2 — This month',
      horizon: 'Visible progress',
      actions: [
        ...improvementAreas.slice(0, 2),
        developingLearners
          ? `Lift Developing band (${developingLearners}) with practice clubs and mid-month check.`
          : 'Publish a mid-month progress note from this report book to school leadership.',
      ].slice(0, 3),
    },
    {
      phase: 'Phase 3 — Next term',
      horizon: 'Partnership depth',
      actions: [
        ...growthAreas.slice(0, 2),
        'Refresh this report book early next term and compare equity gap, attendance, and Excellent-band growth.',
      ].slice(0, 3),
    },
  ];

  const involvement = [
    'School leadership: own one priority from Phase 1 and review this book in the next management meeting.',
    'Assigned teachers: update Manual Result Entry and the daily attendance roll so every child stays visible.',
    'Learners: each status band has a personal next step — celebrate Excellent, coach Developing, recover at-risk.',
    'Parents/guardians: share attendance and support needs early; invite them into the Phase 1 recovery conversations.',
    'Rillcod partnership: use Refresh snapshot after new manual entries so the next book always feels current — never stale.',
  ];

  const headlineParts = [
    `${snapshot.school.name}: ${snapshot.summary.activeStudents} learners`,
    `avg ${snapshot.summary.averageScore}%`,
    `attendance ${snapshot.summary.attendanceRate}%`,
    `curriculum ${snapshot.summary.curriculumCoverage}%`,
  ];
  if (scoreEquityGap >= 15) headlineParts.push(`class gap ${scoreEquityGap} pts`);
  if (manualResultCount > 0) headlineParts.push(`${manualResultCount} via Manual Result Entry`);

  return {
    headline: `${headlineParts.join(' · ')}.`,
    strengths: strengths.slice(0, 5),
    risks: risks.slice(0, 5),
    priorities: priorities.slice(0, 4),
    growthAreas: growthAreas.slice(0, 5),
    improvementAreas: improvementAreas.slice(0, 5),
    nextPhaseSchool,
    nextPhaseLearners,
    involvement,
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
