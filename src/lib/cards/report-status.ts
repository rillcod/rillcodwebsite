export type ReportFilter = 'all' | 'published' | 'draft' | 'no_report';
export type ReportStatusInput = { has_published_report?: boolean; has_draft_report?: boolean };

export function reportBucket(report: ReportStatusInput): 'published' | 'draft' | 'none' {
  if (report.has_published_report) return 'published';
  if (report.has_draft_report) return 'draft';
  return 'none';
}

export function matchesReportFilter(report: ReportStatusInput, filter: ReportFilter): boolean {
  if (filter === 'all') return true;
  return reportBucket(report) === (filter === 'no_report' ? 'none' : filter);
}
