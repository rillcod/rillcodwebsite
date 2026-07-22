import type { SchoolPerformanceReportRow } from '../types';

export type AcademicTerm = {
  id: string;
  academic_year: string;
  term_label: string;
  term_number: number;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

export type ReportListItem = Pick<
  SchoolPerformanceReportRow,
  | 'id'
  | 'school_id'
  | 'title'
  | 'period_start'
  | 'period_end'
  | 'academic_year'
  | 'term_label'
  | 'status'
  | 'published_at'
  | 'created_at'
  | 'updated_at'
  | 'created_by'
  | 'published_revision_number'
  | 'working_revision_number'
> & { school_name: string; creator_name: string };

export type SchoolOption = { id: string; name: string };

export type ReportSetupForm = {
  schoolId: string;
  academicTermId: string;
  title: string;
  startDate: string;
  endDate: string;
  curriculumStartTerm: number;
  curriculumStartWeek: number;
  curriculumEndTerm: number;
  curriculumEndWeek: number;
  /** Required when the delivery range differs from the detected suggestion. */
  curriculumOverrideReason: string;
  /** Topics ticked in setup wizard — baked into the draft on generate. */
  selectedTopicKeys: string[];
};
