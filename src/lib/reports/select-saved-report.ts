import { filterReportsByRosterSession, type ReportSessionRow } from './session-workflows';

/** Explicit choices never fall back to another course or academic period. */
export function selectSavedReport<T extends ReportSessionRow & { course_id?: string | null }>(
    history: T[],
    options: { reportId?: string | null; courseId?: string | null; session?: { term: string; period: string } | null },
): T | null {
    if (options.reportId) return history.find(report => report.id === options.reportId) ?? null;
    const matching = filterReportsByRosterSession(history, options.session);
    if (options.courseId) return matching.find(report => report.course_id === options.courseId) ?? null;
    return matching[0] ?? null;
}
