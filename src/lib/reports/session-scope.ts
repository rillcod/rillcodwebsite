import {
  formatAcademicSession,
  getCurrentAcademicYear,
  liveAcademicSession,
  sessionsEqual,
  toSession,
} from '@/lib/reports/academic-period';

export type SessionLike = {
  term?: string | null;
  period?: string | null;
};

/** Product vocabulary — three layers teachers must not confuse. */
export const SESSION_SCOPE = {
  /** Calendar month → term (Sept = First, etc.) */
  calendar: 'Calendar today',
  /** classes.term_id / academic_terms on the class row */
  classAssignment: 'Class assignment',
  /** report_term + report_period on a saved document */
  document: 'Saved document session',
  /** Publish roster / grades filter */
  working: 'Working session',
  /** Auto-fill target */
  evidence: 'Evidence session',
} as const;

export function sessionLabel(session: SessionLike | null | undefined): string {
  if (!session) return '';
  return formatAcademicSession(toSession({
    report_term: session.term,
    report_period: session.period,
  }));
}

export function hasSessionIdentity(session: SessionLike | null | undefined): boolean {
  const s = toSession({ report_term: session?.term, report_period: session?.period });
  return Boolean(s.termLabel && s.periodLabel);
}

export function sessionsMatch(a: SessionLike | null | undefined, b: SessionLike | null | undefined): boolean {
  if (!hasSessionIdentity(a) || !hasSessionIdentity(b)) return false;
  return sessionsEqual(
    { report_term: a?.term, report_period: a?.period },
    { report_term: b?.term, report_period: b?.period },
  );
}

/** When scope is known, ignore reports from other academic sessions. */
export function reportMatchesSession(
  report: SessionLike | null | undefined,
  scope: SessionLike | null | undefined,
): boolean {
  if (!hasSessionIdentity(scope)) return true;
  if (!hasSessionIdentity(report)) return false;
  return sessionsMatch(report, scope);
}

export function calendarSessionLabel(now = new Date()): string {
  return formatAcademicSession(liveAcademicSession(now));
}

/** Live calendar as { term, period } — use instead of ad-hoc liveAcademicSession() spreads. */
export function liveSessionLike(now = new Date()): SessionLike {
  const live = liveAcademicSession(now);
  return { term: live.termLabel, period: live.periodLabel };
}

/** Extract class assignment session from an academic_terms join row. */
export function classSessionFromTerms(
  terms?: { term_label?: string | null; academic_year?: string | null } | null,
): SessionLike | null {
  if (!terms?.term_label || !terms?.academic_year) return null;
  return { term: terms.term_label, period: terms.academic_year };
}

/** Extract session from a saved progress report row. */
export function sessionFromReport(
  report?: { report_term?: string | null; report_period?: string | null } | null,
): SessionLike | null {
  if (!report?.report_term || !report?.report_period) return null;
  return { term: report.report_term, period: report.report_period };
}

/** Parse "First Term" or "First Term 2025/2026" filter labels into a session pair. */
export function parseCanonicalTermLabel(
  label: string,
  fallbackPeriod?: string | null,
): SessionLike | null {
  const trimmed = label.trim();
  const full = trimmed.match(/^(First|Second|Third) Term\s+(\d{4}\/\d{4})$/i);
  if (full) {
    return { term: `${full[1]} Term`, period: full[2] };
  }
  const partial = trimmed.match(/^(First|Second|Third) Term$/i);
  if (partial) {
    return {
      term: `${partial[1]} Term`,
      period: fallbackPeriod || getCurrentAcademicYear(),
    };
  }
  return null;
}

export type ClassRowWithTerms = {
  name: string;
  academic_terms?: { term_label?: string | null; academic_year?: string | null } | null;
};

/** Dropdown label from a class row — one call instead of three field passes. */
export function formatClassRowOptionLabel(row: ClassRowWithTerms): string {
  return formatClassOptionLabel(
    row.name,
    row.academic_terms?.term_label,
    row.academic_terms?.academic_year,
  );
}

/** Parent portal / API evidence session with display label. */
export function evidenceSessionPayload(now = new Date()) {
  const session = liveSessionLike(now);
  return { ...session, label: sessionLabel(session) };
}

/** Filter reports to a class's assigned academic session. */
export function reportMatchesClassSession(
  report: { report_term?: string | null; report_period?: string | null } | null | undefined,
  classRow?: { academic_terms?: { term_label?: string | null; academic_year?: string | null } | null } | null,
): boolean {
  return reportMatchesSession(
    sessionFromReport(report),
    classSessionFromTerms(classRow?.academic_terms),
  );
}

/** Dropdown suffix: class name stays clean; term is explained separately. */
export function formatClassOptionLabel(
  className: string,
  term?: string | null,
  year?: string | null,
): string {
  const session = sessionLabel({ term, period: year });
  if (!session) return className;
  return `${className} — ${SESSION_SCOPE.classAssignment.toLowerCase()}: ${session}`;
}

/**
 * Smart working-session pick (one rule everywhere):
 * 1. Manual unlock → keep teacher's saved term/year
 * 2. Class assignment → when class has academic_terms
 * 3. Saved session → localStorage / prior pick
 * 4. Live calendar → last resort
 */
export function resolveSmartWorkingSession(input: {
  classSession?: SessionLike | null;
  saved?: SessionLike | null;
  explicit?: SessionLike | null;
  periodUnlocked?: boolean;
}): SessionLike {
  if (input.periodUnlocked && hasSessionIdentity(input.saved)) {
    return { term: input.saved!.term, period: input.saved!.period };
  }
  if (hasSessionIdentity(input.explicit)) {
    return { term: input.explicit!.term, period: input.explicit!.period };
  }
  if (hasSessionIdentity(input.classSession)) {
    return { term: input.classSession!.term, period: input.classSession!.period };
  }
  if (hasSessionIdentity(input.saved)) {
    return { term: input.saved!.term, period: input.saved!.period };
  }
  const live = liveAcademicSession();
  return { term: live.termLabel, period: live.periodLabel };
}
