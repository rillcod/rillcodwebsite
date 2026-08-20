/**
 * Cross-page session workflows — Write Prev/Next, Publish roster, batch-sync.
 * Pages must call these instead of inline report_term/report_period comparisons.
 */
import { isStaleAcademicSession, resolveSessionForWrite } from './academic-period';
import {
  classSessionFromTerms,
  liveSessionLike,
  reportMatchesSession,
  resolveSmartWorkingSession,
  sessionFromReport,
  type ClassRowWithTerms,
  type SessionLike,
} from './session-scope';

export type ReportSessionRow = {
  id?: string | null;
  report_term?: string | null;
  report_period?: string | null;
};

export type WriteSessionState = {
  report_term: string;
  report_period: string;
};

/** Write builder — adopt opened report session on Prev/Next; never bleed across terms. */
export function resolveWriteHydrateSession(input: {
  hydratedReport: ReportSessionRow | null;
  prevSession: WriteSessionState;
  keepRequestedSession?: boolean;
  live?: SessionLike;
}): Pick<WriteSessionState, 'report_term' | 'report_period'> {
  if (!input.hydratedReport) {
    return {
      report_term: input.prevSession.report_term,
      report_period: input.prevSession.report_period,
    };
  }

  const live = input.live ?? liveSessionLike();
  const adoptedTerm = input.hydratedReport.report_term ?? input.prevSession.report_term;
  const adoptedPeriod = input.hydratedReport.report_period ?? input.prevSession.report_period;
  const staleAdopt = !input.hydratedReport.id
    && !input.keepRequestedSession
    && isStaleAcademicSession(
      adoptedTerm,
      adoptedPeriod,
      live.term ?? undefined,
      live.period ?? undefined,
    );

  return {
    report_term: staleAdopt ? (live.term ?? adoptedTerm) : adoptedTerm,
    report_period: staleAdopt ? (live.period ?? adoptedPeriod) : adoptedPeriod,
  };
}

/** Publish — roster list only includes reports in the confirmed filter session. */
export function filterReportsByRosterSession<T extends ReportSessionRow>(
  reports: T[],
  rosterSession: SessionLike | null | undefined,
): T[] {
  if (!rosterSession?.term || !rosterSession?.period) return reports;
  return reports.filter((row) => reportMatchesSession(sessionFromReport(row), rosterSession));
}

/** Batch-sync modal — align term/year when a class is picked. */
export function resolveBatchSyncSession(input: {
  classRow?: ClassRowWithTerms | null;
  current?: SessionLike;
  periodUnlocked?: boolean;
}): SessionLike {
  return resolveSmartWorkingSession({
    classSession: classSessionFromTerms(input.classRow?.academic_terms),
    saved: input.current,
    periodUnlocked: input.periodUnlocked ?? false,
  });
}

/** Publish — advance stale roster filter when the calendar moves on. */
export function rollRosterSessionIfStale(
  current: SessionLike,
  live?: SessionLike,
): { session: SessionLike; rolledFrom: SessionLike | null } {
  const calendar = live ?? liveSessionLike();
  if (!current.term || !current.period) {
    return { session: calendar, rolledFrom: null };
  }
  if (!isStaleAcademicSession(
    current.term ?? undefined,
    current.period ?? undefined,
    calendar.term ?? undefined,
    calendar.period ?? undefined,
  )) {
    return { session: current, rolledFrom: null };
  }
  return {
    session: { term: calendar.term, period: calendar.period },
    rolledFrom: { term: current.term, period: current.period },
  };
}

/** Supabase/API filter params for roster-scoped report queries. */
export function rosterSessionQueryFilters(rosterSession: SessionLike | null | undefined): {
  report_term: string;
  report_period: string;
} | null {
  if (!rosterSession?.term || !rosterSession?.period) return null;
  return { report_term: rosterSession.term, report_period: rosterSession.period };
}

/** Grades → batch-sync API: allow writing into a prior session when deliberately backfilling. */
export function batchSyncAllowBackfill(term: string, period: string): boolean {
  return isStaleAcademicSession(term, period);
}

/** Batch-sync API: resolve canonical session identity before touching student_progress_reports. */
export function resolveBatchSyncApiSession(
  reportTerm: string,
  reportPeriod: string | null | undefined,
  allowBackfill = false,
): SessionLike {
  const { session } = resolveSessionForWrite(reportTerm, reportPeriod, { allowBackfill });
  return { term: session.termLabel, period: session.periodLabel };
}

/** Grading queue scope from API — term label only until period is returned by API. */
export function gradingEvidenceSession(scope: {
  term_label?: string | null;
  term_id?: string | null;
} | null | undefined): SessionLike {
  if (scope?.term_label) {
    const live = liveSessionLike();
    return { term: scope.term_label, period: live.period };
  }
  return liveSessionLike();
}

/** Full pipeline check: evidence session must match report target before batch-sync merge. */
export function batchSyncSessionMatchesReport(
  targetSession: SessionLike,
  report: ReportSessionRow | null | undefined,
): boolean {
  if (!report?.id) return true;
  return reportMatchesSession(sessionFromReport(report), targetSession);
}
