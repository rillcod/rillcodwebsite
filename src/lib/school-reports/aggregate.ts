import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalGrade, cleanGrade } from '@/lib/classes/naming';
import { attendanceBands, average, scoreBands, percentage } from './calculations';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportInsights } from './insights';
import { loadSchoolReportCurriculum, loadSchoolReportEvidence, loadSchoolReportFinance, loadSchoolReportRoster, loadSchoolReportStaff, type SchoolReportRange } from './loaders';
import { loadSchoolProgrammeScope, normalizeProgrammeLabel, programmeCourseKey } from './school-curriculum-scope';
import { recordSource, type DataSourceStatus } from './source-query';
import type { SchoolReportSnapshot } from './types';
import { loadSchoolReportPolicy } from './report-policy';

export { invoiceMatchesAcademicPeriod } from './invoice-match';
export type { SchoolReportRange } from './loaders';

type AnyClient = SupabaseClient<any>;

const clamp = (value: number) => Math.max(0, Math.min(100, value));

function resolveLearnerGradeLabel(
  student: { grade?: string | null; section_class?: string | null },
  className: string | null | undefined,
): string {
  const fromProfile = cleanGrade(student.grade);
  if (fromProfile) return fromProfile;
  const fromClass = canonicalGrade(className) || canonicalGrade(student.section_class);
  return fromClass || '—';
}

function resolveLearnerSectionLabel(
  student: { section_class?: string | null; class_arm?: string | null },
  className: string | null | undefined,
  gradeLabel: string,
): string {
  const arm = String(student.class_arm || '').trim();
  if (arm) return arm;
  const section = String(student.section_class || '').trim();
  if (section && gradeLabel !== '—' && !section.toLowerCase().includes(gradeLabel.replace(/\s+/g, '').toLowerCase())) {
    return section;
  }
  const cls = String(className || '').trim();
  if (cls && gradeLabel !== '—') {
    const gradePattern = gradeLabel.replace(/\s+/g, '\\s*');
    const withoutGrade = cls.replace(new RegExp(gradePattern, 'i'), '').trim().replace(/^[·\-]\s*/, '');
    if (withoutGrade && withoutGrade !== cls) return withoutGrade;
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

function submissionPercent(row: any): number | null {
  const raw = row.weighted_score ?? row.grade;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const value = Number(raw);
  const maxPoints = Number(row.assignments?.max_points || 0);
  if (row.weighted_score == null && maxPoints > 0 && value <= maxPoints) return clamp((value / maxPoints) * 100);
  return clamp(value);
}

export function resolveReportAttendance(publishedScores: number[], attendanceStatuses: string[]) {
  const validPublished = publishedScores.filter((value) => Number.isFinite(value));
  if (validPublished.length) return { rate: average(validPublished), source: 'result_entry' as const };
  if (!attendanceStatuses.length) return { rate: null, source: 'none' as const };
  const present = attendanceStatuses.filter((status) => ['present', 'late'].includes(status)).length;
  return { rate: percentage(present, attendanceStatuses.length), source: 'manual_roll' as const };
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
  const { submissions, attendance, progressReports, assignments } = evidenceLoad.data;
  const publishedProgressReports = progressReports.filter((row) => row.is_published);

  // Teacher-recorded term assessments (progress reports) are the authoritative academic score when present.
  const progressByStudent = new Map<string, any[]>();
  for (const row of progressReports) {
    if (!row.student_id) continue;
    const list = progressByStudent.get(row.student_id) ?? [];
    list.push(row);
    progressByStudent.set(row.student_id, list);
  }
  const publishedAttendanceAvailable = publishedProgressReports.some(
    (row) => Number.isFinite(Number(row.attendance_score)),
  );

  const scoreByStudent = new Map<string, number[]>();
  for (const row of submissions) {
    const studentId = row.portal_user_id || row.user_id;
    const score = submissionPercent(row);
    if (!studentId || score == null) continue;
    const list = scoreByStudent.get(studentId) ?? [];
    list.push(score);
    scoreByStudent.set(studentId, list);
  }
  const attendanceByStudent = new Map<string, any[]>();
  for (const row of attendance) {
    const studentId = row.user_id || row.student_id;
    if (!studentId) continue;
    const list = attendanceByStudent.get(studentId) ?? [];
    list.push(row);
    attendanceByStudent.set(studentId, list);
  }

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
        return `Improve attendance (now ${attendanceRate ?? 0}%), then catch up on missed work with teacher support.`;
      default:
        return score == null
          ? "Complete this learner's term assessment and class attendance so the next book can coach them personally."
          : 'Add attendance marks and keep result entry current so the next phase plan stays personal.';
    }
  };

  const studentMetrics = studentRows.map((student) => {
    const gradebookScores = scoreByStudent.get(student.id) ?? [];
    const sprRows = progressByStudent.get(student.id) ?? [];
    const publishedSpr = sprRows.filter((row) => row.is_published);
    const sprPool = publishedSpr;
    const sprScores = sprPool
      .map((row) => Number(row.overall_score))
      .filter((value) => Number.isFinite(value));
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
    const publishedAttendance = sprPool
      .map((row) => Number(row.attendance_score))
      .filter((value) => Number.isFinite(value));
    const attendanceEvidence = resolveReportAttendance(
      publishedAttendance,
      publishedAttendanceAvailable ? [] : attendanceRows.map((row) => String(row.status)),
    );
    const attendanceRate = attendanceEvidence.rate;
    const attendanceSource = attendanceEvidence.source;

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
      name: String(student.full_name || 'Learner').trim() || 'Learner',
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
    };
  });
  const studentsWithAttendance = studentMetrics.filter((row) => row.attendanceRate != null);
  const attendanceLearnerIds = new Set(studentsWithAttendance.map((row) => row.id));
  const reportStudentMetrics = studentMetrics.filter((row) => attendanceLearnerIds.has(row.id));
  const scoredStudents = reportStudentMetrics.filter((row) => row.averageScore != null);
  const uniqueLearnersMap = new Map<string, typeof studentMetrics[0]>();
  for (const item of reportStudentMetrics) {
    if (!uniqueLearnersMap.has(item.id)) uniqueLearnersMap.set(item.id, item);
  }
  const learners = Array.from(uniqueLearnersMap.values())
    .map(({ classId: _classId, ...rest }) => rest)
    .sort(compareLearnersForRoster);
  const manualResultCoverage = reportStudentMetrics.filter((row) => row.scoreSource === 'manual_result').length;
  const manualRollCoverage = reportStudentMetrics.filter((row) => row.attendanceSource === 'manual_roll').length;

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
      className: cls.name || 'Unnamed class',
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
        className: metric.className,
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
  const attendanceStudentRows = studentRows.filter((student) => attendanceLearnerIds.has(student.id));
  const assignedLearners = attendanceStudentRows.filter(
    (student) => student.class_id && classNameById.has(student.class_id),
  ).length;
  const unassignedLearners = Math.max(0, attendanceStudentRows.length - assignedLearners);

  const schoolProgrammeScope = await loadSchoolProgrammeScope(admin, schoolId, attendanceStudentRows);
  const enrollmentByKey = new Map(
    schoolProgrammeScope.map((row) => [programmeCourseKey(row.programme, row.course), row.enrolledStudents]),
  );

  const courseGroups = new Map<string, { programme: string; course: string; scores: number[]; students: Set<string> }>();
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
        programme: String(programmeRel?.name || 'Programme'),
      });
    }
  }
  for (const row of submissions) {
    const score = submissionPercent(row);
    const studentId = row.portal_user_id || row.user_id;
    if (score == null || !studentId) continue;
    const courseRelation = Array.isArray(row.assignments?.courses) ? row.assignments.courses[0] : row.assignments?.courses;
    const programmeRelation = Array.isArray(courseRelation?.programs) ? courseRelation.programs[0] : courseRelation?.programs;
    const course = courseRelation?.title || 'Unassigned course';
    const programme = normalizeProgrammeLabel(programmeRelation?.name || 'Unassigned programme');
    const key = programmeCourseKey(programme, course);
    const group: { programme: string; course: string; scores: number[]; students: Set<string> } = courseGroups.get(key) ?? { programme, course, scores: [], students: new Set<string>() };
    group.scores.push(score);
    group.students.add(studentId);
    courseGroups.set(key, group);
  }
  for (const row of publishedProgressReports) {
    const score = Number(row.overall_score);
    if (!row.student_id || !Number.isFinite(score)) continue;
    const meta = row.course_id ? courseMetaById.get(String(row.course_id)) : null;
    const course = meta?.course || row.course_name || 'Term assessment record';
    const programme = normalizeProgrammeLabel(meta?.programme || 'Programme');
    const key = programmeCourseKey(programme, course);
    const group: { programme: string; course: string; scores: number[]; students: Set<string> } = courseGroups.get(key) ?? { programme, course, scores: [], students: new Set<string>() };
    group.scores.push(clamp(score));
    group.students.add(row.student_id);
    courseGroups.set(key, group);
  }
  for (const scopeRow of schoolProgrammeScope) {
    const key = programmeCourseKey(scopeRow.programme, scopeRow.course);
    if (!courseGroups.has(key)) {
      courseGroups.set(key, {
        programme: scopeRow.programme,
        course: scopeRow.course,
        scores: [],
        students: new Set<string>(),
      });
    }
  }

  const programmeCoursePerformance = Array.from(courseGroups.values())
    .map((group) => ({
      programme: group.programme,
      course: group.course,
      submissions: group.scores.length,
      averageScore: average(group.scores),
      students: group.students.size,
      enrolledStudents: enrollmentByKey.get(programmeCourseKey(group.programme, group.course)) || 0,
    }))
    .filter((row) => row.enrolledStudents > 0 || row.students > 0)
    .sort((a, b) => a.programme.localeCompare(b.programme) || b.averageScore - a.averageScore || a.course.localeCompare(b.course));

  const financeLoad = await loadSchoolReportFinance(admin, schoolId, range, checkedAt, {
    enrolledStudentCount: studentsWithAttendance.length,
    reportPolicy,
  });
  dataSources.push(...financeLoad.dataSources);
  const finance = financeLoad.data;
  const invoiceRequest = financeLoad.invoiceRequest;

  const curriculumLoad = await loadSchoolReportCurriculum(
    admin,
    schoolId,
    range,
    checkedAt,
    studentRows,
  );
  dataSources.push(...curriculumLoad.dataSources);
  const { plannedWeeks, completedWeeks, inProgressWeeks, skippedWeeks, courses: curriculumCourses } =
    curriculumLoad.data;

  const notes: string[] = [];
  notes.push(
    `Learner population is attendance-backed: ${studentsWithAttendance.length} distinct learner(s) have attendance evidence in the selected term. Published progress-report attendance is authoritative; term attendance rolls are the fallback. Repeated programme/course rows are deduplicated by learner before totals are calculated.`,
  );
  if (studentRows.length && !scoredStudents.length) {
    notes.push('No verified term assessments or graded gradebook scores were found for this term — complete Report Builder / class grades, then refresh.');
  } else if (manualResultCoverage > 0) {
    notes.push(
      `Academic averages use teacher-recorded term assessments for this term (${manualResultCoverage}/${studentRows.length} learners). Gradebook fills gaps where result entry is missing.`,
    );
  }
  if (studentRows.length && !studentsWithAttendance.length) {
    notes.push('No manual attendance roll or result-entry attendance was found for this term — mark class attendance, then refresh.');
  } else if (manualRollCoverage > 0) {
    notes.push(
      `Attendance prefers the manual class roll for this term (${manualRollCoverage}/${studentRows.length} learners). Result-entry attendance is used only when the roll is empty.`,
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
      `Finance check: invoice bills ${finance.billedStudents} learner(s) but ${finance.enrolledStudents} are enrolled in classes for this report — align the invoice quantity in Finance Center, then refresh snapshot.`,
    );
  } else if (finance.attached && finance.enrolledStudents && !finance.billedStudents) {
    notes.push(
      `Finance check: invoice attached but billed headcount could not be read from line items — confirm quantity matches ${finance.enrolledStudents} enrolled learner(s).`,
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
    school: { id: school.id, name: school.name },
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
      activeStudents: studentsWithAttendance.length,
      activeStaff: activeTeacherIds.size + schoolAccountIds.size,
      activeTeachers: activeTeacherIds.size,
      schoolAccounts: schoolAccountIds.size,
      averageScore: average(scoredStudents.map((row) => row.averageScore as number)),
      attendanceRate: average(studentsWithAttendance.map((row) => row.attendanceRate as number)),
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
