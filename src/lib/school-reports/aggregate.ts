import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalGrade, cleanClassName, cleanGrade } from '@/lib/classes/naming';
import { formatPersonDisplayName, formatSchoolDisplayName } from './display-labels';
import { attendanceBands, average, scoreBands, percentage } from './calculations';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportInsights } from './insights';
import { loadSchoolReportCurriculum, loadSchoolReportEvidence, loadSchoolReportFinance, loadSchoolReportRoster, loadSchoolReportStaff, type SchoolReportRange } from './loaders';
import { loadSchoolProgrammeScope, normalizeProgrammeLabel, programmeCourseKey, supplementProgrammeScopeFromEvidence } from './school-curriculum-scope';
import { recordSource, type DataSourceStatus } from './source-query';
import type { SchoolReportSnapshot } from './types';
import { buildLearnerGradebookDetail, submissionPercent } from './gradebook-detail';
import { buildProgrammeCoursePerformance, mergeProgrammeCoursePerformanceWithEnrolment } from './programme-course-performance';
import {
  attachResolvedProgressReportCourses,
  extractExamScores,
  filterPublishedProgressReports,
  indexAttendanceByPortalUser,
  learnerIncludedInSchoolReport,
  resolveLinkedLearnerAttendance,
} from './progress-report';
import { loadSchoolReportPolicy } from './report-policy';
import { countNoun, nounFor } from './wording';

export { invoiceMatchesAcademicPeriod } from './invoice-match';
export { resolveLinkedLearnerAttendance, resolveReportAttendance } from './progress-report';
export type { SchoolReportRange } from './loaders';

type AnyClient = SupabaseClient<any>;

function resolveLearnerGradeLabel(
  student: { grade?: string | null; section_class?: string | null },
  className: string | null | undefined,
): string {
  const fromClass = canonicalGrade(className);
  if (fromClass) return fromClass;
  const fromProfile = cleanGrade(student.grade);
  if (fromProfile) return fromProfile;
  return canonicalGrade(student.section_class) || '—';
}

function resolveLearnerSectionLabel(
  student: { section_class?: string | null; class_arm?: string | null },
  className: string | null | undefined,
  gradeLabel: string,
): string {
  const cls = String(className || '').trim();
  if (cls && gradeLabel !== '—') {
    const gradePattern = gradeLabel.replace(/\s+/g, '\\s*');
    const withoutGrade = cls.replace(new RegExp(gradePattern, 'i'), '').trim().replace(/^[·\-]\s*/, '').trim();
    if (withoutGrade && withoutGrade !== cls) return withoutGrade;
  }
  const arm = String(student.class_arm || '').trim();
  if (arm) return arm;
  const section = String(student.section_class || '').trim();
  if (section && gradeLabel !== '—' && !section.toLowerCase().includes(gradeLabel.replace(/\s+/g, '').toLowerCase())) {
    return section;
  }
  if (section) return section;
  if (cls && gradeLabel === '—') return cls;
  return '—';
}

/** Back-fill grade/class columns for snapshots saved before grade resolution improved. */
export function resolveLearnerGradeForDisplay(learner: {
  gradeLabel?: string;
  classLabel?: string;
  className: string;
}): { gradeLabel: string; classLabel: string } {
  let gradeLabel = String(learner.gradeLabel || '').trim();
  if (!gradeLabel || gradeLabel === '—') {
    gradeLabel = canonicalGrade(learner.className) || canonicalGrade(learner.classLabel) || '—';
  }
  let classLabel = String(learner.classLabel || '').trim();
  if (!classLabel || classLabel === '—') {
    if (gradeLabel !== '—') {
      const gradePattern = gradeLabel.replace(/\s+/g, '\\s*');
      const withoutGrade = learner.className
        .replace(new RegExp(gradePattern, 'i'), '')
        .trim()
        .replace(/^[·\-]\s*/, '');
      classLabel = withoutGrade && withoutGrade !== learner.className ? withoutGrade : learner.className;
    } else {
      classLabel = learner.className || '—';
    }
  }
  return { gradeLabel, classLabel };
}

function academicGradeRank(label: string): number {
  const value = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const number = Number(value.match(/\d+/)?.[0] || 0);
  if (/pre[- ]?nursery|creche/.test(value)) return number;
  if (/nursery/.test(value)) return 20 + number;
  if (/\bkg\b|kindergarten/.test(value)) return 40 + number;
  if (/basic|primary/.test(value)) return 100 + number;
  if (/jss|junior secondary/.test(value)) return 200 + number;
  if (/\bss\b|sss|senior secondary/.test(value)) return 300 + number;
  return 900;
}

/** Natural school order: grade level, class/arm, then learner name. */
export function compareLearnersForRoster(
  a: { name: string; className: string; gradeLabel?: string; classLabel?: string },
  b: { name: string; className: string; gradeLabel?: string; classLabel?: string },
): number {
  const left = resolveLearnerGradeForDisplay(a);
  const right = resolveLearnerGradeForDisplay(b);
  return (
    academicGradeRank(left.gradeLabel) - academicGradeRank(right.gradeLabel) ||
    left.gradeLabel.localeCompare(right.gradeLabel, undefined, { numeric: true, sensitivity: 'base' }) ||
    left.classLabel.localeCompare(right.classLabel, undefined, { numeric: true, sensitivity: 'base' }) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

/** Prefer grade level (JSS1) with section/class arm — not section alone. */
export function formatLearnerClassLabel(
  grade: string | null | undefined,
  sectionClass: string | null | undefined,
  className: string | null | undefined,
): string {
  const g =
    cleanGrade(grade) ||
    canonicalGrade(className) ||
    canonicalGrade(sectionClass) ||
    '';
  const section = String(sectionClass || '').trim();
  const cls = String(className || '').trim();

  if (g && cls && cls.toLowerCase().includes(g.toLowerCase())) return cls;
  if (g && section) return `${g} · ${section}`;
  if (g && cls && cls.toLowerCase() !== g.toLowerCase()) return `${g} · ${cls}`;
  if (g) return g;
  if (cls) return cls;
  if (section) return section;
  return 'Unassigned class';
}

export async function buildSchoolReportSnapshot(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
): Promise<SchoolReportSnapshot> {
  const checkedAt = new Date().toISOString();
  const dataSources: DataSourceStatus[] = [];

  const { data: school, error: schoolError } = await admin.from('schools').select('id,name').eq('id', schoolId).maybeSingle();
  if (schoolError || !school) throw new Error('School could not be found.');
  dataSources.push(recordSource('school', { rows: [school], required: true, checkedAt }));
  const reportPolicy = await loadSchoolReportPolicy(admin);
  const { data: previousReport } = await admin
    .from('school_performance_reports')
    .select('term_label,academic_year,snapshot')
    .eq('school_id', schoolId)
    .eq('status', 'published')
    .lt('period_end', range.startDate)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousSnapshot = previousReport?.snapshot as SchoolReportSnapshot | null | undefined;
  const previousTerm = previousReport && previousSnapshot?.summary ? {
    termLabel: previousReport.term_label,
    academicYear: previousReport.academic_year,
    averageScore: previousSnapshot.summary.averageScore,
    attendanceRate: previousSnapshot.summary.attendanceRate,
    curriculumCoverage: previousSnapshot.summary.curriculumCoverage,
  } : null;

  const rosterLoad = await loadSchoolReportRoster(admin, schoolId, checkedAt);
  dataSources.push(...rosterLoad.dataSources);
  const { studentRows, classRows, classNameById, classTeacherIdById, classOwnerIds } = rosterLoad.data;
  const studentIds = rosterLoad.studentIds;
  const classIds = rosterLoad.classIds;

  const classesByTeacher = new Map<string, string[]>();
  for (const cls of classRows) {
    if (!cls.teacher_id) continue;
    const list = classesByTeacher.get(cls.teacher_id) ?? [];
    list.push(cls.name || 'Unnamed class');
    classesByTeacher.set(cls.teacher_id, list);
  }

  const staffLoad = await loadSchoolReportStaff(admin, schoolId, classOwnerIds, classesByTeacher, checkedAt);
  dataSources.push(...staffLoad.dataSources);
  const { assignedTeachers, schoolAccountIds, activeTeacherIds, teacherNameById } = staffLoad.data;

  const evidenceLoad = await loadSchoolReportEvidence(admin, schoolId, range, studentIds, classIds, checkedAt);
  dataSources.push(...evidenceLoad.dataSources);
  const { submissions, attendance, progressReports, assignments, legacyStudentIdToPortalUserId } = evidenceLoad.data;
  const publishedProgressReports = filterPublishedProgressReports(progressReports);

  // Teacher-recorded term assessments (progress reports) are the authoritative academic score when present.
  const progressByStudent = new Map<string, any[]>();
  for (const row of progressReports) {
    if (!row.student_id) continue;
    const list = progressByStudent.get(row.student_id) ?? [];
    list.push(row);
    progressByStudent.set(row.student_id, list);
  }
  const submissionsByStudent = new Map<string, any[]>();
  const scoreByStudent = new Map<string, number[]>();
  for (const row of submissions) {
    const studentId = row.portal_user_id || row.user_id;
    if (!studentId) continue;
    const submissionList = submissionsByStudent.get(studentId) ?? [];
    submissionList.push(row);
    submissionsByStudent.set(studentId, submissionList);
    const score = submissionPercent(row);
    if (score == null) continue;
    const list = scoreByStudent.get(studentId) ?? [];
    list.push(score);
    scoreByStudent.set(studentId, list);
  }
  const attendanceByStudent = indexAttendanceByPortalUser(
    attendance,
    new Set(studentIds),
    new Map(Object.entries(legacyStudentIdToPortalUserId || {})),
  );

  const learnerNextStep = (
    status: string,
    score: number | null,
    attendanceRate: number | null,
  ): string => {
    switch (status) {
      case 'Excellent':
        return 'Stretch further: mentor peers, take on an advanced mini-project, and showcase strong work.';
      case 'On track':
        return 'Keep momentum with one stretch task each week and share a strong piece of work with the class.';
      case 'Developing':
        return 'Short daily practice, a weekly check-in with the teacher, and focus on two topics to improve.';
      case 'Needs support':
        return 'Extra support this term: targeted practice, re-try weak areas, and a parent–teacher progress check.';
      case 'Attendance risk':
        return 'Improve consistent attendance and catch up on missed lessons with teacher support.';
      default:
        return score == null
          ? "Complete this learner's term assessment and class attendance so the next book can coach them personally."
          : 'Add attendance marks and keep result entry current so the next phase plan stays personal.';
    }
  };

  const studentMetrics = studentRows.map((student) => {
    const gradebookScores = scoreByStudent.get(student.id) ?? [];
    const sprRows = progressByStudent.get(student.id) ?? [];
    const sprPool = filterPublishedProgressReports(sprRows);
    const sprScores = extractExamScores(sprPool);
    const averageScore = sprScores.length
      ? average(sprScores)
      : gradebookScores.length
        ? average(gradebookScores)
        : null;
    const scoreSource: 'manual_result' | 'gradebook' | 'none' = sprScores.length
      ? 'manual_result'
      : gradebookScores.length
        ? 'gradebook'
        : 'none';

    const attendanceRows = attendanceByStudent.get(student.id) ?? [];
    const attendanceEvidence = resolveLinkedLearnerAttendance(
      sprPool,
      attendanceRows,
      { minRollRecords: reportPolicy.attendance.minRollRecords },
    );
    const attendanceRate = attendanceEvidence.rate;
    const attendanceSource = attendanceEvidence.source;
    const gradebook = buildLearnerGradebookDetail(
      sprPool,
      submissionsByStudent.get(student.id) ?? [],
      attendanceRate,
    );

    let status: 'Excellent' | 'On track' | 'Developing' | 'Needs support' | 'Attendance risk' | 'No evidence' =
      'No evidence';
    if (averageScore == null && attendanceRate == null) status = 'No evidence';
    else if (averageScore != null && averageScore < reportPolicy.grading.developingMin) status = 'Needs support';
    else if (attendanceRate != null && attendanceRate < reportPolicy.attendance.riskBelow) status = 'Attendance risk';
    else if (averageScore != null && averageScore >= reportPolicy.grading.excellentMin) status = 'Excellent';
    else if (averageScore != null && averageScore >= reportPolicy.grading.developingMin) status = 'Developing';
    else status = 'On track';

    const growthHints = sprPool
      .flatMap((row) => String(row.areas_for_growth || '').split(/[;|\n]/))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);
    const keyStrengths = sprPool
      .flatMap((row) => String(row.key_strengths || '').split(/[;|\n]/))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);

    const className = student.class_id ? classNameById.get(student.class_id) ?? null : null;
    const gradeLabel = resolveLearnerGradeLabel(student, className);
    const classLabel = resolveLearnerSectionLabel(student, className, gradeLabel);

    return {
      id: student.id,
      name: formatPersonDisplayName(student.full_name),
      classId: student.class_id || null,
      gradeLabel,
      classLabel,
      className: formatLearnerClassLabel(
        gradeLabel !== '—' ? gradeLabel : student.grade,
        student.section_class,
        className,
      ),
      averageScore,
      attendanceRate,
      submissions: gradebookScores.length || sprScores.length,
      status,
      scoreSource,
      attendanceSource,
      nextStep: learnerNextStep(status, averageScore, attendanceRate),
      growthHints,
      keyStrengths,
      gradebook,
    };
  });
  const studentsWithAttendance = studentMetrics.filter((row) => row.attendanceRate != null);
  const reportStudentMetrics = studentMetrics.filter((row) => learnerIncludedInSchoolReport(row));
  const reportLearnerIds = new Set(reportStudentMetrics.map((row) => row.id));
  const scoredStudents = reportStudentMetrics.filter((row) => row.averageScore != null);
  const scoreOnlyLearners = reportStudentMetrics.filter(
    (row) => row.averageScore != null && row.attendanceRate == null,
  ).length;
  const uniqueLearnersMap = new Map<string, typeof studentMetrics[0]>();
  for (const item of reportStudentMetrics) {
    if (!uniqueLearnersMap.has(item.id)) uniqueLearnersMap.set(item.id, item);
  }
  const learners = Array.from(uniqueLearnersMap.values())
    .map(({ classId: _classId, ...rest }) => rest)
    .sort(compareLearnersForRoster);
  const manualResultCoverage = reportStudentMetrics.filter((row) => row.scoreSource === 'manual_result').length;
  const manualRollCoverage = reportStudentMetrics.filter((row) => row.attendanceSource === 'manual_roll').length;
  const resultEntryAttendanceCoverage = reportStudentMetrics.filter((row) => row.attendanceSource === 'result_entry').length;

  // Segment by real school classes first (class_id), then fall back to free-text labels.
  const classBuckets = new Map<
    string,
    {
      classId: string | null;
      className: string;
      teacherId: string | null;
      rows: typeof studentMetrics;
    }
  >();
  for (const cls of classRows) {
    const key = `id:${cls.id}`;
    classBuckets.set(key, {
      classId: cls.id,
      className: cleanClassName(cls.name || '') || cls.name || 'Unnamed class',
      teacherId: cls.teacher_id || null,
      rows: [],
    });
  }
  for (const metric of reportStudentMetrics) {
    const key = metric.classId && classNameById.has(metric.classId) ? `id:${metric.classId}` : `name:${metric.className}`;
    const existing = classBuckets.get(key);
    if (existing) {
      existing.rows.push(metric);
    } else {
      classBuckets.set(key, {
        classId: metric.classId,
        className: cleanClassName(metric.className) || metric.className,
        teacherId: metric.classId ? classTeacherIdById.get(metric.classId) || null : null,
        rows: [metric],
      });
    }
  }
  const classPerformance = Array.from(classBuckets.values())
    .filter((bucket) => bucket.rows.length > 0)
    .map((bucket) => ({
      classId: bucket.classId,
      className: bucket.className,
      teacherId: bucket.teacherId,
      teacherName: bucket.teacherId ? teacherNameById.get(bucket.teacherId) || null : null,
      students: bucket.rows.length,
      averageScore: average(bucket.rows.flatMap((row) => (row.averageScore == null ? [] : [row.averageScore]))),
      attendanceRate: average(bucket.rows.flatMap((row) => (row.attendanceRate == null ? [] : [row.attendanceRate]))),
      submissions: bucket.rows.reduce((sum, row) => sum + row.submissions, 0),
    }))
    .sort((a, b) => b.averageScore - a.averageScore || a.className.localeCompare(b.className));

  const participantsInClasses = classPerformance.reduce((sum, row) => sum + row.students, 0);
  const reportStudentRows = studentRows.filter((student) => reportLearnerIds.has(student.id));
  const assignedLearners = reportStudentRows.filter(
    (student) => student.class_id && classNameById.has(student.class_id),
  ).length;
  const unassignedLearners = Math.max(0, reportStudentRows.length - assignedLearners);

  const schoolProgrammeScopeBase = await loadSchoolProgrammeScope(admin, schoolId, studentRows);
  const studentClassById = new Map<string, string>();
  for (const student of studentRows) {
    if (!student.class_id) continue;
    const className = classNameById.get(student.class_id);
    if (className) studentClassById.set(student.id, className);
  }
  const enrollmentByKey = new Map(
    schoolProgrammeScopeBase.map((row) => [programmeCourseKey(row.programme, row.course), row.enrolledStudents]),
  );

  const progressCourseIds = Array.from(
    new Set(publishedProgressReports.map((row) => row.course_id).filter(Boolean)),
  ) as string[];
  const courseMetaById = new Map<string, { course: string; programme: string }>();
  if (progressCourseIds.length) {
    const { data: courseRows } = await admin
      .from('courses')
      .select('id,title,programs(name)')
      .in('id', progressCourseIds);
    for (const row of (courseRows ?? []) as any[]) {
      const programmeRel = Array.isArray(row.programs) ? row.programs[0] : row.programs;
      courseMetaById.set(String(row.id), {
        course: String(row.title || 'Course'),
        programme: normalizeProgrammeLabel(String(programmeRel?.name || 'Programme')),
      });
    }
  }

  const resolvedPublishedReports = attachResolvedProgressReportCourses(
    publishedProgressReports,
    schoolProgrammeScopeBase,
    studentClassById,
    courseMetaById,
  );

  const schoolProgrammeScope = supplementProgrammeScopeFromEvidence(
    schoolProgrammeScopeBase,
    resolvedPublishedReports.map((row) => ({
      studentId: row.student_id,
      courseId: row.resolvedCourseId || row.course_id,
      courseName: row.resolvedCourse,
      programme: row.resolvedProgramme,
    })),
  );
  for (const row of schoolProgrammeScope) {
    enrollmentByKey.set(programmeCourseKey(row.programme, row.course), row.enrolledStudents);
  }

  const programmeCoursePerformance = mergeProgrammeCoursePerformanceWithEnrolment(
    buildProgrammeCoursePerformance({
      scope: schoolProgrammeScope,
      publishedReports: resolvedPublishedReports,
      submissions,
      courseMetaById,
      enrollmentByKey,
      studentClassById,
    }),
    schoolProgrammeScope.map((row) => ({
      programme: row.programme,
      course: row.course,
      enrolledStudents: row.enrolledStudents,
    })),
  );

  const financeLoadPromise = loadSchoolReportFinance(admin, schoolId, range, checkedAt, {
    enrolledStudentCount: reportStudentMetrics.length,
    reportPolicy,
  });
  const curriculumLoadPromise = loadSchoolReportCurriculum(
    admin,
    schoolId,
    range,
    checkedAt,
    studentRows,
    schoolProgrammeScope,
  );
  const [financeLoad, curriculumLoad] = await Promise.all([financeLoadPromise, curriculumLoadPromise]);
  dataSources.push(...financeLoad.dataSources);
  const finance = financeLoad.data;
  const invoiceRequest = financeLoad.invoiceRequest;

  dataSources.push(...curriculumLoad.dataSources);
  const { plannedWeeks, completedWeeks, inProgressWeeks, skippedWeeks, courses: curriculumCourses } =
    curriculumLoad.data;

  const notes: string[] = [];
  notes.push(
    `${countNoun(reportStudentMetrics.length, 'learner')} are included in this report because they have a published term score and/or linked attendance for the selected term. Professional sessional attendance (class roll) overrides Report Builder attendance when enough session marks exist; otherwise the Attendance % field (participation_score) backfills. Note: attendance_score on progress reports is assignments %, not attendance.`,
  );
  if (scoreOnlyLearners > 0) {
    notes.push(
      `${scoreOnlyLearners} learner${scoreOnlyLearners === 1 ? '' : 's'} appear from published term scores without separate attendance — add class roll marks or an Attendance % in Report Builder to complete their attendance column.`,
    );
  }
  if (studentRows.length && !scoredStudents.length) {
    notes.push('No verified term assessments or graded gradebook scores were found for this term — complete Report Builder / class grades, then refresh.');
  } else if (manualResultCoverage > 0) {
    notes.push(
      `Academic averages use teacher-recorded term assessments for this term (${manualResultCoverage}/${studentRows.length} learners). Gradebook fills gaps where result entry is missing.`,
    );
  }
  if (studentRows.length && !studentsWithAttendance.length) {
    notes.push('No manual attendance roll or result-entry attendance was found for this term — mark class attendance, then refresh.');
  } else if (resultEntryAttendanceCoverage > 0 || manualRollCoverage > 0) {
    notes.push(
      `Linked attendance per learner: ${manualRollCoverage} from professional sessional rolls (overrides score entry), ${resultEntryAttendanceCoverage} backfilled from Report Builder Attendance % (participation_score). School summary attendance averages learners with attendance evidence only.`,
    );
  }
  if (unassignedLearners > 0) {
    notes.push(
      `${unassignedLearners} active learner${unassignedLearners === 1 ? '' : 's'} ${unassignedLearners === 1 ? 'is' : 'are'} not assigned to a school class — assign them in Classes, then refresh.`,
    );
  }
  if (schoolProgrammeScope.length > 0) {
    const missingEvidence = schoolProgrammeScope.filter(
      (row) => row.enrolledStudents > 0 && !programmeCoursePerformance.some(
        (pc) => programmeCourseKey(pc.programme, pc.course) === programmeCourseKey(row.programme, row.course) && pc.students > 0,
      ),
    );
    if (missingEvidence.length) {
      notes.push(
        `${missingEvidence.length} enrolled programme/course${missingEvidence.length === 1 ? '' : 's'} have learners but no term scores yet: ${missingEvidence.map((row) => `${row.programme} · ${row.course} (${row.enrolledStudents} enrolled)`).join('; ')}.`,
      );
    }
  }
  if (!plannedWeeks) notes.push('No school curriculum weeks were available in the selected curriculum range.');
  const unmappedCurriculumCourses = curriculumCourses.filter((row) => (row.planned || 0) === 0);
  if (unmappedCurriculumCourses.length) {
    notes.push(
      `No authored syllabus weeks in this window for ${unmappedCurriculumCourses.map((row) => `${row.programme} · ${row.course}`).join(', ')}. Generate programme topics from What we taught, then tick only what was delivered.`,
    );
  }
  notes.push(
    `Teacher counts include only staff assigned via teacher_schools or who own a class at this school (${assignedTeachers.length} teachers). Platform-wide teachers are excluded.`,
  );
  if (classPerformance.some((row) => !row.teacherId)) {
    notes.push('Some classes at this school have no assigned class teacher; those rows show without a teacher name.');
  }
  const invoiceRequestNote = invoiceRequest;
  if (invoiceRequestNote) notes.push(invoiceRequestNote);
  if (finance.attached && finance.enrolledStudents && finance.billedStudents && finance.enrollmentAligned === false) {
    notes.push(
      `Finance check: invoice bills ${countNoun(finance.billedStudents, 'learner')} but ${finance.enrolledStudents} are enrolled in classes for this report — align the invoice quantity in Finance Center, then refresh snapshot.`,
    );
  } else if (finance.attached && finance.enrolledStudents && !finance.billedStudents) {
    notes.push(
      `Finance check: invoice attached but billed headcount could not be read from line items — confirm quantity matches ${finance.enrolledStudents} enrolled ${nounFor(finance.enrolledStudents, 'learner')}.`,
    );
  }
  const overrideReason = String(range.curriculumOverrideReason || '').trim();
  if (overrideReason) {
    notes.push(`Curriculum delivery range was manually overridden: ${overrideReason}`);
  }
  notes.push('Figures are a frozen aggregate snapshot created from records available at generation time.');

  const draftSnapshot: SchoolReportSnapshot = {
    reportPolicy,
    previousTerm,
    generatedAt: new Date().toISOString(),
    snapshotVersion: 1,
    school: { id: school.id, name: formatSchoolDisplayName(school.name) },
    period: {
      startDate: range.startDate, endDate: range.endDate,
      academicTermId: range.academicTermId,
      academicYear: range.academicYear,
      termLabel: range.termLabel,
      academicTermNumber: range.academicTermNumber,
      curriculumStart: { term: range.curriculumStartTerm, week: range.curriculumStartWeek },
      curriculumEnd: { term: range.curriculumEndTerm, week: range.curriculumEndWeek },
    },
    summary: {
      activeStudents: reportStudentMetrics.length,
      learnersWithAttendance: studentsWithAttendance.length,
      activeStaff: activeTeacherIds.size + schoolAccountIds.size,
      activeTeachers: activeTeacherIds.size,
      schoolAccounts: schoolAccountIds.size,
      averageScore: average(scoredStudents.map((row) => row.averageScore as number)),
      attendanceRate: average(studentsWithAttendance.map((row) => row.attendanceRate as number)),
      attendanceFromResultEntry: resultEntryAttendanceCoverage,
      attendanceFromManualRoll: manualRollCoverage,
      curriculumCoverage: percentage(completedWeeks, plannedWeeks),
      assignmentsCreated: assignments.length,
      submissionsReceived: submissions.length,
      studentsWithScores: scoredStudents.length,
      participantsInClasses,
      unassignedLearners,
    },
    scoreBands: scoreBands(scoredStudents.map((row) => row.averageScore as number), reportPolicy.grading),
    attendanceBands: attendanceBands(studentsWithAttendance.map((row) => row.attendanceRate as number), reportPolicy.attendance),
    classPerformance,
    staff: {
      assignedTeachers: assignedTeachers.length,
      schoolAccounts: schoolAccountIds.size,
      teachers: assignedTeachers,
    },
    learners,
    programmeCoursePerformance,
    schoolProgrammes: schoolProgrammeScope.map((row) => ({
      programme: row.programme,
      course: row.course,
      enrolledStudents: row.enrolledStudents,
      classNames: row.classNames.slice(0, 6),
    })),
    curriculum: { plannedWeeks, completedWeeks, inProgressWeeks, skippedWeeks, courses: curriculumCourses },
    finance,
    completeness: {
      readyToPublish: false,
      score: 0,
      totalRequired: 0,
      completedRequired: 0,
      items: [],
    },
    dataNotes: notes,
    dataSources,
  };

  const completeness = buildSchoolReportCompleteness(draftSnapshot);
  const withCompleteness: SchoolReportSnapshot = { ...draftSnapshot, completeness };
  return {
    ...withCompleteness,
    insights: buildSchoolReportInsights(withCompleteness),
  };
}
