export type SchoolReportStatus = 'draft' | 'published' | 'archived';

export interface SchoolReportNarrative {
  executiveSummary: string;
  achievements: string[];
  concerns: string[];
  recommendations: string[];
  nextPeriodFocus: string[];
}

export interface SchoolReportSnapshot {
  generatedAt: string;
  school: { id: string; name: string };
  period: {
    startDate: string;
    endDate: string;
    academicTermId: string;
    academicYear: string;
    termLabel: string;
    academicTermNumber: number;
    curriculumStart: { term: number; week: number };
    curriculumEnd: { term: number; week: number };
  };
  summary: {
    activeStudents: number;
    activeStaff: number;
    activeTeachers: number;
    schoolAccounts: number;
    averageScore: number;
    attendanceRate: number;
    curriculumCoverage: number;
    assignmentsCreated: number;
    submissionsReceived: number;
    studentsWithScores: number;
  };
  scoreBands: Array<{ label: string; count: number; color: string }>;
  attendanceBands: Array<{ label: string; count: number; color: string }>;
  classPerformance: Array<{
    className: string;
    students: number;
    averageScore: number;
    attendanceRate: number;
    submissions: number;
  }>;
  programmeCoursePerformance: Array<{
    programme: string;
    course: string;
    submissions: number;
    averageScore: number;
    students: number;
  }>;
  curriculum: {
    plannedWeeks: number;
    completedWeeks: number;
    inProgressWeeks: number;
    skippedWeeks: number;
    courses: Array<{
      course: string;
      programme: string;
      planned: number;
      completed: number;
      inProgress: number;
      skipped: number;
      coverage: number;
    }>;
  };
  finance: {
    currency: string;
    invoiceCount: number;
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    invoices: Array<{ id: string; invoiceNumber: string; status: string; amount: number; paid: number; outstanding: number; dueDate: string | null }>;
  };
  dataNotes: string[];
}

export interface SchoolPerformanceReportRow {
  id: string;
  school_id: string;
  title: string;
  period_start: string;
  period_end: string;
  curriculum_start_term: number;
  academic_term_id: string | null;
  academic_year: string;
  term_label: string;
  curriculum_start_week: number;
  curriculum_end_term: number;
  curriculum_end_week: number;
  status: SchoolReportStatus;
  snapshot: SchoolReportSnapshot;
  narrative: SchoolReportNarrative;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  school_name?: string;
  creator_name?: string;
}
