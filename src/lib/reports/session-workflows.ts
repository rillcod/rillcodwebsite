/**
 * Cross-page session workflows — Write Prev/Next, Publish roster, and grading.
 * Pages must call these instead of inline report_term/report_period comparisons.
 */
import { isStaleAcademicSession } from './academic-period';
import {
  liveSessionLike,
  reportMatchesSession,
  sessionFromReport,
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
