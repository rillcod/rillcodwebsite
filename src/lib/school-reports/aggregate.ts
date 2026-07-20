import type { SupabaseClient } from '@supabase/supabase-js';
import { attendanceBands, average, inCurriculumRange, percentage, scoreBands } from './calculations';
import type { SchoolReportSnapshot } from './types';

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

function submissionPercent(row: any): number | null {
  const raw = row.weighted_score ?? row.grade;
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const value = Number(raw);
  const maxPoints = Number(row.assignments?.max_points || 0);
  if (row.weighted_score == null && maxPoints > 0 && value <= maxPoints) return clamp((value / maxPoints) * 100);
  return clamp(value);
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

export function invoiceMatchesAcademicPeriod(
  invoice: any,
  period: Pick<SchoolReportRange, 'academicYear' | 'termLabel' | 'academicTermNumber'>,
): boolean {
  const metadata = invoice?.metadata && typeof invoice.metadata === 'object' ? invoice.metadata : {};
  const cycle = Array.isArray(invoice?.billing_cycles) ? invoice.billing_cycles[0] : invoice?.billing_cycles;
  const label = String(cycle?.term_label || metadata.term_label || metadata.academic_term || '').toLowerCase();
  const metadataYear = String(metadata.academic_year || metadata.academicYear || '').toLowerCase();
  const yearMatches = metadataYear === period.academicYear.toLowerCase() || label.includes(period.academicYear.toLowerCase());
  const termMatches = Number(metadata.term_number || metadata.termNumber) === period.academicTermNumber
    || label.includes(period.termLabel.toLowerCase())
    || label.includes(`term ${period.academicTermNumber}`);
  return yearMatches && termMatches;
}

export async function buildSchoolReportSnapshot(
  admin: AnyClient,
  schoolId: string,
  range: SchoolReportRange,
): Promise<SchoolReportSnapshot> {
  const { data: school, error: schoolError } = await admin.from('schools').select('id,name').eq('id', schoolId).maybeSingle();
  if (schoolError || !school) throw new Error('School could not be found.');

  const [{ data: students, error: studentError }, { data: classes }] = await Promise.all([
    admin.from('portal_users').select('id,full_name,class_id,section_class,grade').eq('role', 'student').eq('school_id', schoolId).eq('is_active', true).or('is_deleted.is.null,is_deleted.eq.false').limit(5000),
    admin.from('classes').select('id,name').eq('school_id', schoolId).limit(1000),
  ]);
  if (studentError) throw new Error(`Student data is unavailable: ${studentError.message}`);
  const studentRows = (students ?? []) as any[];
  const studentIds = studentRows.map((row) => row.id);
  const classRows = (classes ?? []) as any[];
  const classNameById = new Map(classRows.map((row) => [row.id, row.name]));

  let submissions: any[] = [];
  let attendance: any[] = [];
  if (studentIds.length) {
    const idList = studentIds.join(',');
    const [submissionResult, attendanceResult] = await Promise.all([
      admin.from('assignment_submissions').select('portal_user_id,user_id,grade,weighted_score,status,submitted_at,assignments(max_points,course_id,program_id,courses(title,programs(name)))').or(`portal_user_id.in.(${idList}),user_id.in.(${idList})`).gte('submitted_at', isoStart(range.startDate)).lte('submitted_at', isoEnd(range.endDate)).limit(10000),
      admin.from('attendance').select('user_id,student_id,status,created_at').or(`user_id.in.(${idList}),student_id.in.(${idList})`).gte('created_at', isoStart(range.startDate)).lte('created_at', isoEnd(range.endDate)).limit(20000),
    ]);
    submissions = submissionResult.data ?? [];
    attendance = attendanceResult.data ?? [];
  }

  const classIds = classRows.map((row) => row.id);
  let assignments: any[] = [];
  if (classIds.length) {
    const { data } = await admin.from('assignments').select('id').in('class_id', classIds).gte('created_at', isoStart(range.startDate)).lte('created_at', isoEnd(range.endDate)).limit(5000);
    assignments = data ?? [];
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

  const studentMetrics = studentRows.map((student) => {
    const scores = scoreByStudent.get(student.id) ?? [];
    const attendanceRows = attendanceByStudent.get(student.id) ?? [];
    const present = attendanceRows.filter((row) => ['present', 'late'].includes(String(row.status))).length;
    return {
      id: student.id,
      className: classNameById.get(student.class_id) || student.section_class || student.grade || 'Unassigned class',
      averageScore: scores.length ? average(scores) : null,
      attendanceRate: attendanceRows.length ? percentage(present, attendanceRows.length) : null,
      submissions: scores.length,
    };
  });
  const scoredStudents = studentMetrics.filter((row) => row.averageScore != null);
  const studentsWithAttendance = studentMetrics.filter((row) => row.attendanceRate != null);

  const groupedClasses = new Map<string, typeof studentMetrics>();
  for (const metric of studentMetrics) {
    const list = groupedClasses.get(metric.className) ?? [];
    list.push(metric);
    groupedClasses.set(metric.className, list);
  }
  const classPerformance = Array.from(groupedClasses.entries()).map(([className, rows]) => ({
    className,
    students: rows.length,
    averageScore: average(rows.flatMap((row) => row.averageScore == null ? [] : [row.averageScore])),
    attendanceRate: average(rows.flatMap((row) => row.attendanceRate == null ? [] : [row.attendanceRate])),
    submissions: rows.reduce((sum, row) => sum + row.submissions, 0),
  })).sort((a, b) => b.averageScore - a.averageScore || a.className.localeCompare(b.className));
  const courseGroups = new Map<string, { programme: string; course: string; scores: number[]; students: Set<string> }>();
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
  const programmeCoursePerformance = Array.from(courseGroups.values()).map((group) => ({
    programme: group.programme,
    course: group.course,
    submissions: group.scores.length,
    averageScore: average(group.scores),
    students: group.students.size,
  })).sort((a, b) => a.programme.localeCompare(b.programme) || b.averageScore - a.averageScore || a.course.localeCompare(b.course));

  const [{ data: directlyAttachedStaff }, { data: teacherAssignments }, { data: invoiceRows }] = await Promise.all([
    admin.from('portal_users').select('id,role').eq('school_id', schoolId).in('role', ['teacher', 'school']).eq('is_active', true).or('is_deleted.is.null,is_deleted.eq.false').limit(1000),
    admin.from('teacher_schools').select('teacher_id').eq('school_id', schoolId).limit(1000),
    admin.from('invoices').select('id,invoice_number,status,amount,amount_paid,amount_remaining,currency,due_date,metadata,billing_cycles(term_label,term_start_date)').eq('school_id', schoolId).limit(1000),
  ]);
  const assignedTeacherIds = Array.from(new Set(((teacherAssignments ?? []) as any[]).map((row) => row.teacher_id).filter(Boolean)));
  let activeAssignedTeachers: any[] = [];
  if (assignedTeacherIds.length) {
    const { data } = await admin.from('portal_users').select('id,role').in('id', assignedTeacherIds).eq('role', 'teacher').eq('is_active', true).or('is_deleted.is.null,is_deleted.eq.false').limit(1000);
    activeAssignedTeachers = data ?? [];
  }
  const directRows = (directlyAttachedStaff ?? []) as any[];
  const activeTeacherIds = new Set([
    ...directRows.filter((row) => row.role === 'teacher').map((row) => row.id),
    ...activeAssignedTeachers.map((row) => row.id),
  ]);
  const schoolAccountIds = new Set(directRows.filter((row) => row.role === 'school').map((row) => row.id));

  const selectedInvoices = ((invoiceRows ?? []) as any[]).filter((invoice) => invoiceMatchesAcademicPeriod(invoice, range));
  const invoices = selectedInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status || 'pending',
    amount: Number(invoice.amount || 0),
    paid: Number(invoice.amount_paid || 0),
    outstanding: Number(invoice.amount_remaining ?? Math.max(0, Number(invoice.amount || 0) - Number(invoice.amount_paid || 0))),
    dueDate: invoice.due_date || null,
  }));
  const financeCurrency = selectedInvoices.find((invoice) => invoice.currency)?.currency || 'NGN';

  const [{ data: curricula }, { data: tracking }] = await Promise.all([
    admin.from('course_curricula').select('id,content,courses(title,programs(name))').eq('school_id', schoolId).eq('is_visible_to_school', true).limit(1000),
    admin.from('curriculum_week_tracking').select('curriculum_id,term_number,week_number,status').eq('school_id', schoolId).limit(10000),
  ]);
  const trackingRows = ((tracking ?? []) as any[]).filter((row) => inCurriculumRange(
    Number(row.term_number), Number(row.week_number),
    range.curriculumStartTerm, range.curriculumStartWeek,
    range.curriculumEndTerm, range.curriculumEndWeek,
  ));
  const curriculumCourses = ((curricula ?? []) as any[]).map((curriculum) => {
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
  const plannedWeeks = curriculumCourses.reduce((sum, row) => sum + row.planned, 0);
  const completedWeeks = curriculumCourses.reduce((sum, row) => sum + row.completed, 0);
  const inProgressWeeks = curriculumCourses.reduce((sum, row) => sum + row.inProgress, 0);
  const skippedWeeks = curriculumCourses.reduce((sum, row) => sum + row.skipped, 0);

  const notes: string[] = [];
  if (studentRows.length && !scoredStudents.length) notes.push('No graded submissions were recorded in the selected date range.');
  if (studentRows.length && !studentsWithAttendance.length) notes.push('No attendance records were recorded in the selected date range.');
  if (!plannedWeeks) notes.push('No school curriculum weeks were available in the selected curriculum range.');
  if (!invoices.length) notes.push(`No school invoice matched ${range.termLabel}, ${range.academicYear}; no unrelated invoice was attached.`);
  notes.push('Figures are a frozen aggregate snapshot created from records available at generation time.');

  return {
    generatedAt: new Date().toISOString(),
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
    programmeCoursePerformance,
    curriculum: { plannedWeeks, completedWeeks, inProgressWeeks, skippedWeeks, courses: curriculumCourses },
    finance: {
      currency: financeCurrency,
      invoiceCount: invoices.length,
      totalInvoiced: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
      totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paid, 0),
      totalOutstanding: invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0),
      invoices,
    },
    dataNotes: notes,
  };
}
