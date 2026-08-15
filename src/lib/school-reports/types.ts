import type { SchoolReportDesignSettings } from './design';
import type { LearnerGradebookDetail } from './gradebook-detail';

export type SchoolReportStatus = 'draft' | 'published' | 'archived';

export interface SchoolReportNarrative {
  executiveSummary: string;
  /** Staff-controlled prose on programmes, courses, and topics delivered this term. */
  topicsCovered?: string;
  achievements: string[];
  concerns: string[];
  recommendations: string[];
  nextPeriodFocus: string[];
  /**
   * Whether a model actually wrote this, or it fell back to the deterministic
   * template. Recorded because the fallback produces a perfectly plausible
   * report: a retired model id left every partner school receiving template
   * text for months and nothing surfaced it. Staff can now see which they have
   * before publishing. Optional so older stored narratives stay valid.
   */
  source?: 'ai' | 'fallback';
}

export interface SchoolReportSnapshot {
  /** Frozen policy used to calculate and render this report revision. */
  reportPolicy?: import('./report-policy').SchoolReportPolicy;
  previousTerm?: {
    termLabel: string;
    academicYear: string;
    averageScore: number;
    attendanceRate: number;
    curriculumCoverage: number;
  } | null;
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
    /** Learners with class roll or result-entry attendance (subset of activeStudents). */
    learnersWithAttendance?: number;
    activeStaff: number;
    activeTeachers: number;
    schoolAccounts: number;
    averageScore: number;
    attendanceRate: number;
    /** Learners whose attendance came from published result entry. */
    attendanceFromResultEntry?: number;
    /** Learners whose attendance came from the class roll. */
    attendanceFromManualRoll?: number;
    curriculumCoverage: number;
    assignmentsCreated: number;
    submissionsReceived: number;
    studentsWithScores: number;
    /** Sum of learners placed in class performance rows. */
    participantsInClasses?: number;
    /** Active learners without a class assignment in roster. */
    unassignedLearners?: number;
  };
  scoreBands: Array<{ label: string; count: number; color: string }>;
  attendanceBands: Array<{ label: string; count: number; color: string }>;
  classPerformance: Array<{
    classId: string | null;
    className: string;
    teacherId: string | null;
    teacherName: string | null;
    students: number;
    averageScore: number;
    attendanceRate: number;
    submissions: number;
  }>;
  /** Teachers assigned to this school (teacher_schools + class owners), not the whole platform. */
  staff?: {
    assignedTeachers: number;
    schoolAccounts: number;
    teachers: Array<{
      id: string;
      name: string;
      source: 'teacher_schools' | 'class_owner' | 'both';
      classCount: number;
      classNames: string[];
    }>;
  };
  /** Per-learner roster for the report book appendix. */
  learners: Array<{
    id: string;
    name: string;
    className: string;
    /** Grade level label e.g. JSS1, JSS2 — shown separately on roster tables. */
    gradeLabel?: string;
    /** Class arm / section without grade prefix. */
    classLabel?: string;
    averageScore: number | null;
    attendanceRate: number | null;
    submissions: number;
    status: 'Excellent' | 'On track' | 'Developing' | 'Needs support' | 'Attendance risk' | 'No evidence';
    /** Where the academic average came from for this learner. */
    scoreSource?: 'manual_result' | 'gradebook' | 'none';
    /** Where attendance came from for this learner. */
    attendanceSource?: 'manual_roll' | 'result_entry' | 'none';
    /** Personal next-phase action so the learner feels coached, not ranked. */
    nextStep?: string;
    /** Hints lifted from term assessment record areas_for_growth when available. */
    growthHints?: string[];
    /** Strengths lifted from term assessment record key_strengths when available. */
    keyStrengths?: string[];
    /** Raw exam and assignment scores for Appendix C gradebook. */
    gradebook?: LearnerGradebookDetail;
  }>;
  programmeCoursePerformance: Array<{
    programme: string;
    course: string;
    submissions: number;
    averageScore: number;
    /** Learners with term evidence (scores/submissions). */
    students: number;
    /** Active learners enrolled in classes for this programme/course. */
    enrolledStudents?: number;
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
      enrolledStudents?: number;
    }>;
  };
  finance: {
    currency: string;
    invoiceCount: number;
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    /** True when at least one invoice matched this term/year. */
    attached: boolean;
    /** Staff-facing request when invoice is missing. */
    requestMessage: string | null;
    billingHref: string;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      status: string;
      amount: number;
      paid: number;
      outstanding: number;
      dueDate: string | null;
      /** Finance Center deep link to edit this invoice. */
      editHref?: string;
    }>;
    /** Rillcod company bank accounts for term invoice payment. */
    paymentAccounts?: Array<{
      label: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
      paymentNote?: string | null;
    }>;
    /** Why nearby invoices did not attach (only when attached=false). */
    matchDiagnostics?: {
      reportPeriod: { academicYear: string; termLabel: string; academicTermNumber: number };
      candidateCount: number;
      hints: string[];
      nearMisses: Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        reasons: string[];
        editHref: string;
      }>;
    };
    /** Class-enrolled learners in this snapshot (for finance cross-check). */
    enrolledStudents?: number;
    /** Headcount billed on the matched invoice line items. */
    billedStudents?: number;
    /** True when billed headcount matches enrolled learners (within tolerance). */
    enrollmentAligned?: boolean;
  };
  /** Checklist of covered vs missing report areas. */
  completeness: {
    readyToPublish: boolean;
    score: number;
    totalRequired: number;
    completedRequired: number;
    items: Array<{
      key: string;
      label: string;
      ok: boolean;
      required: boolean;
      detail: string;
      actionHref?: string;
      actionLabel?: string;
    }>;
  };
  /** Board-ready intelligence layer derived from the same frozen snapshot. */
  insights?: {
    headline: string;
    strengths: string[];
    risks: string[];
    priorities: string[];
    /** Positive growth opportunities for the school partnership. */
    growthAreas: string[];
    /** Concrete improvement actions tied to the current evidence. */
    improvementAreas: string[];
    /** School-facing delivery summary — what academic work was covered this term. */
    academicCoverage: string[];
    /** Joint Rillcod + school focus (replaces audit-style “areas to improve” on the PDF). */
    partnershipFocus: string[];
    /** Coherent next module / term steps drawn from learner reports and curriculum. */
    nextModuleFocus: string[];
    /** Progressive roadmap so the school feels involved across phases. */
    nextPhaseSchool: Array<{ phase: string; horizon: string; actions: string[] }>;
    /** Band-level next steps that keep learners personally involved. */
    nextPhaseLearners: Array<{ band: string; count: number; nextStep: string }>;
    /** Ways owners, teachers, learners and parents stay in the loop. */
    involvement: string[];
    /** Evidence depth ledger — assignments, submissions, scored learners. */
    evidenceLedger: string[];
    /** Who delivered for the school this term. */
    teacherDelivery: string[];
    /** Syllabus / module coverage rows for tables. */
    moduleCoverage: Array<{
      programme: string;
      course: string;
      completed: number;
      planned: number;
      coverage: number;
      status: string;
    }>;
    /** Topics evidenced through teaching, results, or curriculum weeks — school path, not full map. */
    deliveredTopics?: Array<{
      programme: string;
      course: string;
      source: 'curriculum' | 'learner_evidence' | 'both';
      weeksCompleted: number;
      weeksPlanned: number;
      weeksInProgress: number;
      learners: number;
      submissions: number;
      averageScore: number | null;
    }>;
    /** Plain note that schools follow their own delivery path. */
    deliveryPathNote?: string;
    /** Seed prose for topics covered — learner evidence + curriculum, honest partial path. */
    topicsProseSeed?: string;
    /** Positive milestones completed together this term. */
    partnershipMilestones: string[];
    /** Planned vs delivered vs next — commitment summary. */
    deliveryCommitment: { planned: string[]; delivered: string[]; next: string[] };
    /** Unified delivery ledger — programme/course ranges + evidence + next (no duplication). */
    deliveryLedger?: import('./delivery-structure').DeliveryLedger;
    /** Excellent learners worth celebrating. */
    celebrationWall: Array<{ name: string; className: string; highlight: string }>;
    /** Highlights from learner key_strengths in result entry. */
    learnerHighlights: string[];
    /** Newsletter-ready paragraph for school leadership. */
    communityMessage: string;
    /** Featured programme spotlight for this term (legacy — first course only). */
    programmeSpotlight: {
      programme: string;
      course: string;
      summary: string;
      nextIntro: string;
    } | null;
    /** Every course/programme with evidence this term — fair multi-course view. */
    programmeSpotlights: Array<{
      programme: string;
      course: string;
      summary: string;
      nextIntro: string;
      qrDataUrl?: string;
      videoUrl?: string;
    }>;
    /** Suggested date for a joint Rillcod + school review. */
    suggestedPartnershipReview: string;
    topClass: { className: string; teacherName: string | null; averageScore: number } | null;
    bottomClass: { className: string; teacherName: string | null; averageScore: number } | null;
    scoreEquityGap: number;
    atRiskLearners: number;
    excellentLearners: number;
    classesWithTeacher: number;
    classesTotal: number;
    teacherCoveragePct: number;
    evidenceQualityPct: number;
  };
  dataNotes: string[];
  /** Per-source load health for this snapshot (audit data-quality ledger). */
  dataSources?: import('./source-query').DataSourceStatus[];
  /** Increments each time staff regenerates the frozen snapshot. */
  snapshotVersion?: number;
  /** Programmes/courses discovered from school classes when snapshot was built. */
  schoolProgrammes?: Array<{
    programme: string;
    course: string;
    enrolledStudents: number;
    classNames?: string[];
  }>;
  /** Staff-ticked topics for this report — spans across the week window; checkpoint for next term. */
  deliveryDeclaration?: import('./delivery-declaration').DeliveryDeclaration;
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
  design?: SchoolReportDesignSettings | null;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  lock_version: number;
  working_revision_number?: number | null;
  published_revision_number?: number | null;
  verification_code?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  acknowledgement_name?: string | null;
  acknowledgement_note?: string | null;
  created_at: string;
  updated_at: string;
  school_name?: string;
  creator_name?: string;
}
