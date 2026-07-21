import type { SchoolReportSnapshot } from '../types';

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
  curriculumOverrideReason?: string;
}

export type LoaderResult<T> = {
  data: T;
  dataSources: import('../source-query').DataSourceStatus[];
};

export type SchoolReportFinanceLoadResult = LoaderResult<SchoolReportSnapshot['finance']> & {
  invoiceRequest: string | null;
};

export type SchoolReportCurriculumLoadResult = LoaderResult<SchoolReportSnapshot['curriculum']>;
