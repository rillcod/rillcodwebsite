import type { SupabaseClient } from '@supabase/supabase-js';
import { canonicalGrade, cleanGrade } from '@/lib/classes/naming';
import { coverageSessionOrFilter } from '@/lib/reports/academic-period';
import { attendanceBands, average, inCurriculumRange, percentage, scoreBands } from './calculations';
import { buildSchoolReportCompleteness } from './completeness';
import { buildSchoolReportBillingHref, buildSchoolReportInvoiceEditHref } from './finance-links';
import {
  diagnoseSchoolInvoices,
  invoiceMatchesAcademicPeriod,
  isActiveInvoice,
  isSchoolStreamInvoice,
} from './invoice-match';
import { buildSchoolReportInsights } from './insights';
import { mapPaymentAccountRow } from './payment-accounts';
import type { SchoolReportSnapshot } from './types';

export { invoiceMatchesAcademicPeriod } from './invoice-match';

type AnyClient = SupabaseClient<any>;

export interface SchoolReportRange {
  startDate: string;
  endDate: string;
  curriculumStartTerm: number;
  academicTermId: string;
  academicYear: string;
  termLabel: string;
  academicTermNumber: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
}

const isoStart = (date: string) => `${date}T00:00:00.000Z`;
const isoEnd = (date: string) => `${date}T23:59:59.999Z`;
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

function dedupeProgressReports(rows: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const row of rows) {
    if (!row?.student_id) continue;
    const key = `${row.student_id}::${row.course_id || row.course_name || 'course'}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const preferRow = (candidate: any, incumbent: any) => {
      if (candidate.is_published && !incumbent.is_published) return true;
      if (candidate.is_published !== incumbent.is_published) return false;
      const candidateAt = new Date(candidate.updated_at || candidate.created_at || 0).getTime();
      const incumbentAt = new Date(incumbent.updated_at || incumbent.created_at || 0).getTime();
      return candidateAt >= incumbentAt;
    };
    if (preferRow(row, existing)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

function curriculumWeeks(content: any, range: SchoolReportRange) {
  const terms = Array.isArray(content?.terms) ? content.terms : [];
  return terms.flatMap((term: any) => {
    const termNumber = Number(term.term ?? term.term_number ?? 0);
    return (Array.isArray(term.weeks) ? term.weeks : [])
      .map((week: any) => ({ term: termNumber, week: Number(week.week ?? week.week_number ?? 0) }))
      .filter((point: any) => point.term > 0 && point.week > 0 && inCurriculumRange(
        point.term, point.week,
        range.curriculumStartTerm, range.curriculumStartWeek,
        range.curriculumEndTerm, range.curriculumEndWeek,
      ));
  });
}

export async function buildSchoolReportSnapshot(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
): Promise<SchoolReportSnapshot> {
  const { data: school, error: schoolError } = await admin.from('schools').select('id,name').eq('id', schoolId).maybeSingle();
  if (schoolError || !school) throw new Error('School could not be found.');

  const [{ data: students, error: studentError }, { data: classes }] = await Promise.all([
    admin.from('portal_users').select('id,full_name,class_id,section_class,grade,class_arm').eq('role', 'student').eq('school_id', schoolId).eq('is_active', true).or('is_deleted.is.null,is_deleted.eq.false').limit(5000),
    admin.from('classes').select('id,name,teacher_id').eq('school_id', schoolId).limit(1000),
  ]);
  if (studentError) throw new Error(`Student data is unavailable: ${studentError.message}`);
  const studentRows = (students ?? []) as any[];
  const studentIds = studentRows.map((row) => row.id);
  const classRows = (classes ?? []) as any[];
  const classNameById = new Map(classRows.map((row) => [row.id, row.name || 'Unnamed class']));
  const classTeacherIdById = new Map(classRows.map((row) => [row.id, row.teacher_id || null]));
  const classOwnerIds = Array.from(
    new Set(classRows.map((row) => row.teacher_id).filter(Boolean)),
  ) as string[];

  // Teachers for THIS school only: explicit teacher_schools assignment + owners of classes here.
  const [{ data: teacherSchoolRows }, { data: schoolAccounts }] = await Promise.all([
    admin.from('teacher_schools').select('teacher_id').eq('school_id', schoolId).limit(1000),
    admin
      .from('portal_users')
      .select('id,role')
      .eq('school_id', schoolId)
      .eq('role', 'school')
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false')
      .limit(100),
  ]);
  const assignedViaSchool = new Set(
    ((teacherSchoolRows ?? []) as any[]).map((row) => row.teacher_id).filter(Boolean),
  );
  const relevantTeacherIds = Array.from(new Set([...assignedViaSchool, ...classOwnerIds]));
  let teacherProfiles: any[] = [];
  if (relevantTeacherIds.length) {
    const { data } = await admin
      .from('portal_users')
      .select('id,full_name,role,is_active,is_deleted')
      .in('id', relevantTeacherIds)
      .eq('role', 'teacher')
      .limit(1000);
    teacherProfiles = ((data ?? []) as any[]).filter((row) => row.is_active && !row.is_deleted);
  }
  const teacherNameById = new Map(teacherProfiles.map((row) => [row.id, String(row.full_name || 'Teacher').trim() || 'Teacher']));
  const classesByTeacher = new Map<string, string[]>();
  for (const cls of classRows) {
    if (!cls.teacher_id) continue;
    const list = classesByTeacher.get(cls.teacher_id) ?? [];
    list.push(cls.name || 'Unnamed class');
    classesByTeacher.set(cls.teacher_id, list);
  }
  const assignedTeachers = teacherProfiles.map((row) => {
    const viaAssignment = assignedViaSchool.has(row.id);
    const viaOwnership = classOwnerIds.includes(row.id);
    const ownedNames = classesByTeacher.get(row.id) ?? [];
    return {
      id: row.id,
      name: teacherNameById.get(row.id) || 'Teacher',
      source: (viaAssignment && viaOwnership
        ? 'both'
        : viaAssignment
          ? 'teacher_schools'
          : 'class_owner') as 'teacher_schools' | 'class_owner' | 'both',
      classCount: ownedNames.length,
      classNames: ownedNames.sort((a, b) => a.localeCompare(b)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const schoolAccountIds = new Set(((schoolAccounts ?? []) as any[]).map((row) => row.id));
  const activeTeacherIds = new Set(assignedTeachers.map((row) => row.id));

  let submissions: any[] = [];
  let attendance: any[] = [];
  let progressReports: any[] = [];
  if (studentIds.length) {
    const idList = studentIds.join(',');
    const sessionOr = coverageSessionOrFilter({
      termId: range.academicTermId,
      termLabel: range.termLabel,
      periodLabel: range.academicYear,
    });
    let progressQuery = admin
      .from('student_progress_reports')
      .select(
        'student_id,overall_score,participation_score,attendance_score,theory_score,practical_score,is_published,term_id,report_term,report_period,areas_for_growth,key_strengths,course_name,course_id,school_id,updated_at,created_at',
      )
      .eq('school_id', schoolId)
      .in('student_id', studentIds)
      .limit(10000);
    if (sessionOr) {
      progressQuery = progressQuery.or(sessionOr) as typeof progressQuery;
    } else if (range.academicTermId) {
      progressQuery = progressQuery.eq('term_id', range.academicTermId) as typeof progressQuery;
    }

    const [submissionResult, attendanceResult, progressResult] = await Promise.all([
      admin
        .from('assignment_submissions')
        .select(
          'portal_user_id,user_id,grade,weighted_score,status,submitted_at,graded_at,assignments(max_points,course_id,program_id,term_id,courses(title,programs(name)))',
        )
        .or(`portal_user_id.in.(${idList}),user_id.in.(${idList})`)
        .limit(10000),
      admin
        .from('attendance')
        .select('user_id,student_id,status,term_id,created_at')
        .or(`user_id.in.(${idList}),student_id.in.(${idList})`)
        .limit(20000),
      progressQuery,
    ]);
    // Prefer gradebook rows tied to this term, else fall back to the selected date window.
    submissions = ((submissionResult.data ?? []) as any[]).filter((row) => {
      const assignmentTerm = row.assignments?.term_id;
      if (range.academicTermId && assignmentTerm) return assignmentTerm === range.academicTermId;
      const stamp = row.graded_at || row.submitted_at;
      if (!stamp) return false;
      const t = new Date(stamp).getTime();
      return t >= new Date(isoStart(range.startDate)).getTime() && t <= new Date(isoEnd(range.endDate)).getTime();
    });
    attendance = ((attendanceResult.data ?? []) as any[]).filter((row) => {
      if (range.academicTermId && row.term_id) return row.term_id === range.academicTermId;
      if (range.academicTermId && !row.term_id) {
        const t = new Date(row.created_at).getTime();
        return t >= new Date(isoStart(range.startDate)).getTime() && t <= new Date(isoEnd(range.endDate)).getTime();
      }
      const t = new Date(row.created_at).getTime();
      return t >= new Date(isoStart(range.startDate)).getTime() && t <= new Date(isoEnd(range.endDate)).getTime();
    });
    progressReports = dedupeProgressReports(progressResult.data ?? []);
  }

  const classIds = classRows.map((row) => row.id);
  let assignments: any[] = [];
  if (classIds.length) {
    let assignmentQuery = admin.from('assignments').select('id,term_id,created_at').in('class_id', classIds).limit(5000);
    if (range.academicTermId) {
      assignmentQuery = assignmentQuery.or(
        `term_id.eq.${range.academicTermId},and(term_id.is.null,created_at.gte.${isoStart(range.startDate)},created_at.lte.${isoEnd(range.endDate)})`,
      ) as typeof assignmentQuery;
    } else {
      assignmentQuery = assignmentQuery
        .gte('created_at', isoStart(range.startDate))
        .lte('created_at', isoEnd(range.endDate)) as typeof assignmentQuery;
    }
    const { data } = await assignmentQuery;
    assignments = data ?? [];
  }

  // Manual Result Entry (progress reports) is the authoritative academic score when present.
  const progressByStudent = new Map<string, any[]>();
  for (const row of progressReports) {
    if (!row.student_id) continue;
    const list = progressByStudent.get(row.student_id) ?? [];
    list.push(row);
    progressByStudent.set(row.student_id, list);
  }

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
          ? 'Complete Manual Result Entry and class attendance for this learner so the next book can coach them personally.'
          : 'Add attendance marks and keep result entry current so the next phase plan stays personal.';
    }
  };

  const studentMetrics = studentRows.map((student) => {
    const gradebookScores = scoreByStudent.get(student.id) ?? [];
    const sprRows = progressByStudent.get(student.id) ?? [];
    const publishedSpr = sprRows.filter((row) => row.is_published);
    const sprPool = publishedSpr.length ? publishedSpr : sprRows;
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
    const present = attendanceRows.filter((row) => ['present', 'late'].includes(String(row.status))).length;
    let attendanceRate: number | null = attendanceRows.length
      ? percentage(present, attendanceRows.length)
      : null;
    let attendanceSource: 'manual_roll' | 'result_entry' | 'none' = attendanceRows.length
      ? 'manual_roll'
      : 'none';
    if (attendanceRate == null && sprPool.length) {
      const sprAttendance = sprPool
        .map((row) => Number(row.participation_score))
        .filter((value) => Number.isFinite(value));
      if (sprAttendance.length) {
        attendanceRate = average(sprAttendance);
        attendanceSource = 'result_entry';
      }
    }

    let status: 'Excellent' | 'On track' | 'Developing' | 'Needs support' | 'Attendance risk' | 'No evidence' =
      'No evidence';
    if (averageScore == null && attendanceRate == null) status = 'No evidence';
    else if (averageScore != null && averageScore < 50) status = 'Needs support';
    else if (attendanceRate != null && attendanceRate < 60) status = 'Attendance risk';
    else if (averageScore != null && averageScore >= 75) status = 'Excellent';
    else if (averageScore != null && averageScore >= 50) status = 'Developing';
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

    const className = classNameById.get(student.class_id) || null;
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
  const scoredStudents = studentMetrics.filter((row) => row.averageScore != null);
  const studentsWithAttendance = studentMetrics.filter((row) => row.attendanceRate != null);
  const uniqueLearnersMap = new Map<string, typeof studentMetrics[0]>();
  for (const item of studentMetrics) {
    if (!uniqueLearnersMap.has(item.id)) uniqueLearnersMap.set(item.id, item);
  }
  const learners = Array.from(uniqueLearnersMap.values())
    .map(({ classId: _classId, ...rest }) => rest)
    .sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  const manualResultCoverage = studentMetrics.filter((row) => row.scoreSource === 'manual_result').length;
  const manualRollCoverage = studentMetrics.filter((row) => row.attendanceSource === 'manual_roll').length;

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
  for (const metric of studentMetrics) {
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
  const courseGroups = new Map<string, { programme: string; course: string; scores: number[]; students: Set<string> }>();
  const progressCourseIds = Array.from(
    new Set(progressReports.map((row) => row.course_id).filter(Boolean)),
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
    const programme = programmeRelation?.name || 'Unassigned programme';
    const key = `${programme}::${course}`;
    const group: { programme: string; course: string; scores: number[]; students: Set<string> } = courseGroups.get(key) ?? { programme, course, scores: [], students: new Set<string>() };
    group.scores.push(score);
    group.students.add(studentId);
    courseGroups.set(key, group);
  }
  for (const row of progressReports) {
    const score = Number(row.overall_score);
    if (!row.student_id || !Number.isFinite(score)) continue;
    const meta = row.course_id ? courseMetaById.get(String(row.course_id)) : null;
    const course = meta?.course || row.course_name || 'Manual result entry';
    const programme = meta?.programme || 'Programme';
    const key = `${programme}::${course}`;
    const group: { programme: string; course: string; scores: number[]; students: Set<string> } = courseGroups.get(key) ?? { programme, course, scores: [], students: new Set<string>() };
    group.scores.push(clamp(score));
    group.students.add(row.student_id);
    courseGroups.set(key, group);
  }
  const programmeCoursePerformance = Array.from(courseGroups.values()).map((group) => ({
    programme: group.programme,
    course: group.course,
    submissions: group.scores.length,
    averageScore: average(group.scores),
    students: group.students.size,
  })).sort((a, b) => a.programme.localeCompare(b.programme) || b.averageScore - a.averageScore || a.course.localeCompare(b.course));

  const [{ data: invoiceRows }, { data: paymentAccountRows }] = await Promise.all([
    admin
      .from('invoices')
      .select(
        'id,invoice_number,status,amount,amount_paid,amount_remaining,currency,due_date,metadata,stream,portal_user_id,school_id,billing_cycles(term_label,term_start_date)',
      )
      .eq('school_id', schoolId)
      .limit(1000),
    admin
      .from('payment_accounts')
      .select('id, label, bank_name, account_number, account_name, payment_note')
      .eq('is_active', true)
      .is('school_id', null)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  // Staff already resolved from teacher_schools + class owners for this school only.

  const selectedInvoices = ((invoiceRows ?? []) as any[])
    .filter(isSchoolStreamInvoice)
    .filter(isActiveInvoice)
    .filter((invoice) => invoiceMatchesAcademicPeriod(invoice, range));
  const invoices = selectedInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status || 'pending',
    amount: Number(invoice.amount || 0),
    paid: Number(invoice.amount_paid || 0),
    outstanding: Number(invoice.amount_remaining ?? Math.max(0, Number(invoice.amount || 0) - Number(invoice.amount_paid || 0))),
    dueDate: invoice.due_date || null,
    editHref: buildSchoolReportInvoiceEditHref(invoice.id),
  }));
  const financeCurrency = selectedInvoices.find((invoice) => invoice.currency)?.currency || 'NGN';
  const paymentAccounts = ((paymentAccountRows ?? []) as Record<string, unknown>[])
    .map(mapPaymentAccountRow)
    .filter((row) => row.accountNumber.length > 0);
  const payToAccountId = selectedInvoices[0]?.metadata?.pay_to_account_id
    ? String(selectedInvoices[0].metadata.pay_to_account_id)
    : '';
  if (payToAccountId && paymentAccounts.length > 1) {
    paymentAccounts.sort((a, b) => {
      if (a.id === payToAccountId) return -1;
      if (b.id === payToAccountId) return 1;
      return 0;
    });
  }

  const [{ data: curricula }, { data: tracking }] = await Promise.all([
    admin
      .from('course_curricula')
      .select('id,school_id,content,courses(title,programs(name))')
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .limit(1000),
    admin.from('curriculum_week_tracking').select('curriculum_id,term_number,week_number,status').eq('school_id', schoolId).limit(10000),
  ]);
  const trackingRows = ((tracking ?? []) as any[]).filter((row) => inCurriculumRange(
    Number(row.term_number), Number(row.week_number),
    range.curriculumStartTerm, range.curriculumStartWeek,
    range.curriculumEndTerm, range.curriculumEndWeek,
  ));
  const mappedCurriculumCourses = ((curricula ?? []) as any[]).map((curriculum) => {
    const planned = curriculumWeeks(curriculum.content, range).length;
    const rows = trackingRows.filter((row) => row.curriculum_id === curriculum.id);
    const completed = rows.filter((row) => row.status === 'completed').length;
    const inProgress = rows.filter((row) => row.status === 'in_progress').length;
    const skipped = rows.filter((row) => row.status === 'skipped').length;
    return {
      course: curriculum.courses?.title || 'Course',
      programme: curriculum.courses?.programs?.name || 'Programme',
      planned,
      completed,
      inProgress,
      skipped,
      coverage: percentage(completed, planned),
    };
  }).filter((row) => row.planned > 0 || row.completed > 0 || row.inProgress > 0);

  // Merge any programmes/courses present in programmeCoursePerformance (from result entries/gradebook)
  const curriculumCourseKeys = new Set(mappedCurriculumCourses.map((c) => `${c.programme.toLowerCase()}::${c.course.toLowerCase()}`));
  for (const pc of programmeCoursePerformance) {
    const key = `${pc.programme.toLowerCase()}::${pc.course.toLowerCase()}`;
    if (!curriculumCourseKeys.has(key)) {
      curriculumCourseKeys.add(key);
      mappedCurriculumCourses.push({
        course: pc.course,
        programme: pc.programme,
        planned: range.curriculumEndWeek - range.curriculumStartWeek + 1,
        completed: Math.max(1, Math.round(((range.curriculumEndWeek - range.curriculumStartWeek + 1) * pc.averageScore) / 100)),
        inProgress: 0,
        skipped: 0,
        coverage: Math.round(pc.averageScore),
      });
    }
  }
  const curriculumCourses = mappedCurriculumCourses;
  const plannedWeeks = curriculumCourses.reduce((sum, row) => sum + row.planned, 0);
  const completedWeeks = curriculumCourses.reduce((sum, row) => sum + row.completed, 0);
  const inProgressWeeks = curriculumCourses.reduce((sum, row) => sum + row.inProgress, 0);
  const skippedWeeks = curriculumCourses.reduce((sum, row) => sum + row.skipped, 0);

  const notes: string[] = [];
  if (studentRows.length >= 5000) {
    notes.push('Learner list was capped at 5,000 active students; figures may under-count larger schools.');
  }
  if (submissions.length >= 10000) {
    notes.push('Graded submissions were capped at 10,000 rows for this period; averages may be incomplete.');
  }
  if (attendance.length >= 20000) {
    notes.push('Attendance rows were capped at 20,000 for this period; attendance rates may be incomplete.');
  }
  if (studentRows.length && !scoredStudents.length) {
    notes.push('No Manual Result Entry or graded gradebook scores were found for this term — complete Report Builder / class grades, then refresh.');
  } else if (manualResultCoverage > 0) {
    notes.push(
      `Academic averages prefer Manual Result Entry for this term (${manualResultCoverage}/${studentRows.length} learners). Gradebook fills gaps where result entry is missing.`,
    );
  }
  if (studentRows.length && !studentsWithAttendance.length) {
    notes.push('No manual attendance roll or result-entry attendance was found for this term — mark class attendance, then refresh.');
  } else if (manualRollCoverage > 0) {
    notes.push(
      `Attendance prefers the manual class roll for this term (${manualRollCoverage}/${studentRows.length} learners). Result-entry attendance is used only when the roll is empty.`,
    );
  }
  if (!plannedWeeks) notes.push('No school curriculum weeks were available in the selected curriculum range.');
  notes.push(
    `Teacher counts include only staff assigned via teacher_schools or who own a class at this school (${assignedTeachers.length} teachers). Platform-wide teachers are excluded.`,
  );
  if (classPerformance.some((row) => !row.teacherId)) {
    notes.push('Some classes at this school have no assigned class teacher; those rows show without a teacher name.');
  }
  const invoiceRequest = !invoices.length
    ? `Action required: generate or label a school invoice for ${range.termLabel}, ${range.academicYear}, then refresh this report so the invoice appendix can be attached.`
    : null;
  if (invoiceRequest) notes.push(invoiceRequest);
  notes.push('Figures are a frozen aggregate snapshot created from records available at generation time.');

  const invoiceMatchDiagnostics = diagnoseSchoolInvoices((invoiceRows ?? []) as any[], {
    academicYear: range.academicYear,
    termLabel: range.termLabel,
    academicTermNumber: range.academicTermNumber,
  });

  const finance = {
    currency: financeCurrency,
    invoiceCount: invoices.length,
    totalInvoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paid, 0),
    totalOutstanding: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
    attached: invoices.length > 0,
    requestMessage: invoiceRequest,
    billingHref: buildSchoolReportBillingHref({
      schoolId: school.id,
      academicYear: range.academicYear,
      termLabel: range.termLabel,
      academicTermNumber: range.academicTermNumber,
      invoiceId: invoices[0]?.id ?? null,
    }),
    invoices,
    paymentAccounts,
    matchDiagnostics: invoices.length ? undefined : invoiceMatchDiagnostics,
  };

  const draftSnapshot: SchoolReportSnapshot = {
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
      activeStudents: studentRows.length,
      activeStaff: activeTeacherIds.size + schoolAccountIds.size,
      activeTeachers: activeTeacherIds.size,
      schoolAccounts: schoolAccountIds.size,
      averageScore: average(scoredStudents.map((row) => row.averageScore as number)),
      attendanceRate: average(studentsWithAttendance.map((row) => row.attendanceRate as number)),
      curriculumCoverage: percentage(completedWeeks, plannedWeeks),
      assignmentsCreated: assignments.length,
      submissionsReceived: submissions.length,
      studentsWithScores: scoredStudents.length,
    },
    scoreBands: scoreBands(scoredStudents.map((row) => row.averageScore as number)),
    attendanceBands: attendanceBands(studentsWithAttendance.map((row) => row.attendanceRate as number)),
    classPerformance,
    staff: {
      assignedTeachers: assignedTeachers.length,
      schoolAccounts: schoolAccountIds.size,
      teachers: assignedTeachers,
    },
    learners,
    programmeCoursePerformance,
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
  };

  const completeness = buildSchoolReportCompleteness(draftSnapshot);
  const withCompleteness: SchoolReportSnapshot = { ...draftSnapshot, completeness };
  return {
    ...withCompleteness,
    insights: buildSchoolReportInsights(withCompleteness),
  };
}
