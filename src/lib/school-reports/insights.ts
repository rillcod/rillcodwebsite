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
    strengths.push(
      `${excellentLearners} learner(s) reached the Excellent band — a strong base to celebrate and stretch further.`,
    );
  }
  if ((snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers) > 0) {
    strengths.push(
      `${snapshot.staff?.assignedTeachers || snapshot.summary.activeTeachers} teacher(s) are assigned to this school (not platform-wide).`,
    );
  }

  if (snapshot.summary.averageScore > 0 && snapshot.summary.averageScore < 50) {
    risks.push(`Average score of ${snapshot.summary.averageScore}% shows room to strengthen core skills together this term.`);
    improvementAreas.push('Pair learners below 50% with short guided practice and weekly teacher check-ins.');
  }
  if (snapshot.summary.attendanceRate > 0 && snapshot.summary.attendanceRate < 70) {
    risks.push(`Attendance at ${snapshot.summary.attendanceRate}% may be limiting learning time.`);
    improvementAreas.push('Work with class teachers and parents on a friendly same-day absence follow-up.');
  }
  if (scoreEquityGap >= 20) {
    risks.push(
      `Class average gap is ${scoreEquityGap} points between strongest and weakest class — worth aligning approaches.`,
    );
    improvementAreas.push(
      `Share what works in ${top?.className || 'the leading class'} with ${bottom?.className || 'other classes'}.`,
    );
  }
  if (atRiskLearners > 0) {
    risks.push(`${atRiskLearners} learner(s) would benefit from closer support or attendance coaching.`);
    improvementAreas.push(`Agree a simple support plan for the ${atRiskLearners} learner(s) flagged this term.`);
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
    improvementAreas.push('Create the term invoice in Finance Center (linked from the Data tab), then refresh snapshot.');
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
    priorities.push(`Agree a warm, practical support plan for the ${atRiskLearners} learner(s) who need extra attention.`);
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
      phase: 'Now — this fortnight',
      horizon: 'Quick wins with the school',
      actions: [
        ...priorities.slice(0, 2),
        atRiskLearners
          ? `Teachers and school leadership review the ${atRiskLearners} learner(s) who need support and agree next steps.`
          : 'Share one class success with learners and parents.',
      ].slice(0, 3),
    },
    {
      phase: 'This month',
      horizon: 'Visible progress together',
      actions: [
        ...improvementAreas.slice(0, 2),
        developingLearners
          ? `Help ${developingLearners} Developing learner(s) move up with practice and encouragement.`
          : 'Send a short progress note to school leadership from this report book.',
      ].slice(0, 3),
    },
    {
      phase: 'Next term',
      horizon: 'Deepen the partnership',
      actions: [
        ...growthAreas.slice(0, 2),
        'Refresh this report book early next term and celebrate gains in scores, attendance, and curriculum.',
      ].slice(0, 3),
    },
  ];

  const involvement = [
    'School leadership: pick one shared priority from this book and review progress in your next meeting.',
    'Assigned teachers: keep Manual Result Entry and attendance rolls up to date so every child stays visible.',
    'Learners: celebrate Excellent work, encourage Developing learners, and support those who need help.',
    'Parents: partner on attendance and home practice when teachers reach out.',
    'Rillcod: refresh this snapshot after new entries so the school always sees current evidence.',
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
