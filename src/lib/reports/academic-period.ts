// Central academic-session identity for all report / coverage / builder paths.
// Nigerian school calendar: Sept–Aug, three positional terms.
//
// HARD RULE: a session is ALWAYS the pair (academic year + term label).
// "Second Term" and "Third Term" are never interchangeable.
// "First Term 2025/2026" and "First Term 2026/2027" are never interchangeable.
// All write / coverage / filter logic must go through these helpers — do not
// re-derive term/year comparisons ad hoc in UI or API routes.

export const ACADEMIC_TERM_OPTIONS = [
  'First Term',
  'Second Term',
  'Third Term',
  'Mid-Term',
  'Termly',
  'Annual',
] as const;

export type PositionalTermLabel = 'First Term' | 'Second Term' | 'Third Term';
export type AcademicTermLabel = (typeof ACADEMIC_TERM_OPTIONS)[number];

/** Immutable session identity — the only safe unit for storage and matching. */
export type AcademicSession = {
  termLabel: string;
  periodLabel: string; // e.g. "2025/2026"
};

const TERM_RANK: Record<string, number> = {
  'first term': 1,
  'mid-term': 1.5,
  'second term': 2,
  'third term': 3,
  termly: 4,
  annual: 5,
};

const POSITIONAL = new Set(['first term', 'second term', 'third term']);

export function normalizeTermLabel(term: string | null | undefined): string {
  return String(term ?? '').trim();
}

export function normalizePeriodLabel(period: string | null | undefined): string {
  return String(period ?? '').trim();
}

export function termRank(term: string | null | undefined): number {
  return TERM_RANK[normalizeTermLabel(term).toLowerCase()] ?? 0;
}

export function isPositionalTerm(term: string | null | undefined): boolean {
  return POSITIONAL.has(normalizeTermLabel(term).toLowerCase());
}

/** Starting calendar year of "2025/2026" → 2025. */
export function academicYearStart(period: string | null | undefined): number {
  const m = normalizePeriodLabel(period).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Canonical opaque key used for maps, dedupe, logs. Never reverse-engineer. */
export function sessionIdentityKey(
  termOrSession: string | AcademicSession | null | undefined,
  period?: string | null,
): string {
  if (termOrSession && typeof termOrSession === 'object') {
    return `${normalizePeriodLabel(termOrSession.periodLabel)}|${normalizeTermLabel(termOrSession.termLabel)}`;
  }
  return `${normalizePeriodLabel(period)}|${normalizeTermLabel(termOrSession as string)}`;
}

/** Exact identity match — Second ≠ Third; same term label across years ≠ same session. */
export function sessionsEqual(
  a: AcademicSession | { report_term?: string | null; report_period?: string | null } | null | undefined,
  b: AcademicSession | { report_term?: string | null; report_period?: string | null } | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = toSession(a);
  const right = toSession(b);
  if (!left.termLabel || !left.periodLabel || !right.termLabel || !right.periodLabel) return false;
  return sessionIdentityKey(left) === sessionIdentityKey(right);
}

export function toSession(
  input:
    | AcademicSession
    | { report_term?: string | null; report_period?: string | null; termLabel?: string; periodLabel?: string }
    | null
    | undefined,
): AcademicSession {
  if (!input) return { termLabel: '', periodLabel: '' };
  if ('termLabel' in input || 'periodLabel' in input) {
    return {
      termLabel: normalizeTermLabel((input as AcademicSession).termLabel),
      periodLabel: normalizePeriodLabel((input as AcademicSession).periodLabel),
    };
  }
  return {
    termLabel: normalizeTermLabel((input as { report_term?: string | null }).report_term),
    periodLabel: normalizePeriodLabel((input as { report_period?: string | null }).report_period),
  };
}

type ReportLike = {
  report_term?: string | null;
  report_period?: string | null;
  is_published?: boolean | null;
  updated_at?: string | null;
};

/** Newest-first: year → term → published → updated_at. */
export function compareReportsByPeriodDesc(a: ReportLike, b: ReportLike): number {
  const yearDiff = academicYearStart(b.report_period) - academicYearStart(a.report_period);
  if (yearDiff !== 0) return yearDiff;
  const termDiff = termRank(b.report_term) - termRank(a.report_term);
  if (termDiff !== 0) return termDiff;
  const pubDiff = Number(b.is_published ?? false) - Number(a.is_published ?? false);
  if (pubDiff !== 0) return pubDiff;
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}

/** Compare two sessions chronologically: negative if a is before b. */
export function compareSessions(a: AcademicSession, b: AcademicSession): number {
  const yearDiff = academicYearStart(a.periodLabel) - academicYearStart(b.periodLabel);
  if (yearDiff !== 0) return yearDiff;
  return termRank(a.termLabel) - termRank(b.termLabel);
}

// ── Live calendar ────────────────────────────────────────────────────────────

/** Current positional term from calendar month: Sept–Dec → First, May–Aug → Third, else Second. */
export function getCurrentTermLabel(now = new Date()): PositionalTermLabel {
  const m = now.getMonth() + 1;
  if (m >= 9) return 'First Term';
  if (m >= 5) return 'Third Term';
  return 'Second Term';
}

/** Current academic session string on the Sept–Aug calendar (e.g. "2025/2026"). */
export function getCurrentAcademicYear(now = new Date()): string {
  return now.getMonth() + 1 >= 9
    ? `${now.getFullYear()}/${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}/${now.getFullYear()}`;
}

export function liveAcademicSession(now = new Date()): AcademicSession {
  return {
    termLabel: getCurrentTermLabel(now),
    periodLabel: getCurrentAcademicYear(now),
  };
}

export function academicYearOptions(now = new Date()): string[] {
  const base = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return [base - 1, base, base + 1, base + 2, base + 3].map((y) => `${y}/${y + 1}`);
}

/**
 * True when saved session is BEHIND the live calendar.
 * Future sessions (e.g. next-year First Term while still in current Third) are NOT stale.
 */
export function isStaleAcademicSession(
  savedTerm: string | null | undefined,
  savedPeriod: string | null | undefined,
  currentTerm = getCurrentTermLabel(),
  currentPeriod = getCurrentAcademicYear(),
): boolean {
  const saved = toSession({ report_term: savedTerm, report_period: savedPeriod });
  const live = toSession({ termLabel: currentTerm, periodLabel: currentPeriod });
  if (!saved.termLabel || !saved.periodLabel) return true;

  const savedY = academicYearStart(saved.periodLabel);
  const liveY = academicYearStart(live.periodLabel);
  if (savedY > 0 && liveY > 0 && savedY < liveY) return true;
  // Same year, older positional term (Second while live is Third).
  if (saved.periodLabel === live.periodLabel && saved.termLabel !== live.termLabel) {
    const a = termRank(saved.termLabel);
    const b = termRank(live.termLabel);
    if (a > 0 && b > 0 && a < b) return true;
  }
  return false;
}

/**
 * Resolve what session a write should land on.
 * - Default: roll stale prior sessions up to live (Samuel fix).
 * - allowBackfill: keep the requested prior session (intentional unlock).
 * Never invent a hybrid identity (e.g. Third Term + previous year).
 */
export function resolveSessionForWrite(
  requestedTerm: string | null | undefined,
  requestedPeriod: string | null | undefined,
  opts?: { allowBackfill?: boolean; live?: AcademicSession; now?: Date },
): { session: AcademicSession; rolled: boolean } {
  const live = opts?.live ?? liveAcademicSession(opts?.now);
  const requested = toSession({ report_term: requestedTerm, report_period: requestedPeriod });
  if (opts?.allowBackfill) {
    return {
      session: {
        termLabel: requested.termLabel || live.termLabel,
        periodLabel: requested.periodLabel || live.periodLabel,
      },
      rolled: false,
    };
  }
  if (isStaleAcademicSession(requested.termLabel, requested.periodLabel, live.termLabel, live.periodLabel)) {
    return { session: { ...live }, rolled: true };
  }
  return {
    session: {
      termLabel: requested.termLabel || live.termLabel,
      periodLabel: requested.periodLabel || live.periodLabel,
    },
    rolled: false,
  };
}

/**
 * True when an UPDATE on `existing` with `next` would destroy a prior session's history.
 * Callers MUST retarget (dedupe/insert current) instead of rewriting in place.
 */
export function wouldRewriteSessionIdentity(
  existing: { report_term?: string | null; report_period?: string | null } | null | undefined,
  next: AcademicSession,
): boolean {
  if (!existing) return false;
  const prev = toSession(existing);
  if (!prev.termLabel || !prev.periodLabel) return false;
  return !sessionsEqual(prev, next);
}

/**
 * PostgREST OR filter: match by canonical term_id OR exact (term + period) labels.
 * Keeps Second/Third and year boundaries strict while still finding legacy rows.
 */
export function coverageSessionOrFilter(input: {
  termId?: string | null;
  termLabel?: string | null;
  periodLabel?: string | null;
}): string | null {
  const termId = String(input.termId ?? '').trim();
  const term = normalizeTermLabel(input.termLabel);
  const period = normalizePeriodLabel(input.periodLabel);
  if (termId && term && period) {
    return `term_id.eq.${termId},and(report_term.eq."${term}",report_period.eq."${period}")`;
  }
  return null;
}

/** Human display: "2025/2026 · Third Term". */
export function formatAcademicSession(session: AcademicSession): string {
  const s = toSession(session);
  if (!s.periodLabel && !s.termLabel) return '';
  if (!s.periodLabel) return s.termLabel;
  if (!s.termLabel) return s.periodLabel;
  return `${s.periodLabel} · ${s.termLabel}`;
}

// ── Finance / class adapters (start-year storage vs full period label) ────────

/** "2025/2026" → "2025"; also accepts bare "2025". */
export function periodStartYear(period: string | null | undefined): string {
  const n = academicYearStart(period);
  return n > 0 ? String(n) : '';
}

/** "2025" or "2025/2026" → canonical "2025/2026". */
export function periodFromStartYear(yearOrPeriod: string | number | null | undefined): string {
  const raw = String(yearOrPeriod ?? '').trim();
  if (!raw) return '';
  if (raw.includes('/')) return normalizePeriodLabel(raw);
  const y = parseInt(raw.replace(/\D/g, '').slice(0, 4), 10);
  if (!Number.isFinite(y) || y < 2000) return '';
  return `${y}/${y + 1}`;
}

export function termNumberFromLabel(label: string | null | undefined): '1' | '2' | '3' {
  const rank = termRank(label);
  if (rank >= 2.5) return '3';
  if (rank >= 2) return '2';
  if (rank >= 1) return '1';
  const l = normalizeTermLabel(label).toLowerCase();
  if (l.includes('third')) return '3';
  if (l.includes('second')) return '2';
  return '1';
}

export function labelFromTermNumber(termNumber: string | number | null | undefined): PositionalTermLabel {
  const n = String(termNumber ?? '').trim();
  if (n === '3') return 'Third Term';
  if (n === '2') return 'Second Term';
  return 'First Term';
}

/** Advance one positional school term (Third → next year's First). */
export function nextAcademicSession(session: AcademicSession): AcademicSession {
  const s = toSession(session);
  const start = academicYearStart(s.periodLabel) || academicYearStart(getCurrentAcademicYear());
  const num = parseInt(termNumberFromLabel(s.termLabel), 10);
  if (num < 3) {
    return {
      termLabel: labelFromTermNumber(num + 1),
      periodLabel: `${start}/${start + 1}`,
    };
  }
  return {
    termLabel: 'First Term',
    periodLabel: `${start + 1}/${start + 2}`,
  };
}

/** Prior positional school term (First → previous year's Third). */
export function priorAcademicSession(session: AcademicSession): AcademicSession {
  const s = toSession(session);
  const start = academicYearStart(s.periodLabel) || academicYearStart(getCurrentAcademicYear());
  const num = parseInt(termNumberFromLabel(s.termLabel), 10);
  if (num > 1) {
    return {
      termLabel: labelFromTermNumber(num - 1),
      periodLabel: `${start}/${start + 1}`,
    };
  }
  return {
    termLabel: 'Third Term',
    periodLabel: `${start - 1}/${start}`,
  };
}

/**
 * Finance builder key used in invoice metadata:
 * academic_year = session-start calendar year ("2025"), term_number = "1"|"2"|"3".
 * Always pair with periodLabel + positional termLabel when writing display strings.
 */
export function liveSchoolTermRef(now = new Date()): {
  academicYear: string;
  termNumber: '1' | '2' | '3';
  periodLabel: string;
  termLabel: PositionalTermLabel;
} {
  const live = liveAcademicSession(now);
  return {
    academicYear: periodStartYear(live.periodLabel),
    termNumber: termNumberFromLabel(live.termLabel),
    periodLabel: live.periodLabel,
    termLabel: live.termLabel as PositionalTermLabel,
  };
}

/** Canonical display for finance docs: "2025/2026 · Third Term". */
export function schoolSessionDisplay(
  academicYearOrPeriod: string | number | null | undefined,
  termNumberOrLabel: string | number | null | undefined,
): string {
  const period =
    periodFromStartYear(academicYearOrPeriod) ||
    (typeof termNumberOrLabel === 'string' && termNumberOrLabel.includes('/')
      ? periodFromStartYear(termNumberOrLabel)
      : '');
  const term =
    typeof termNumberOrLabel === 'string' && /term/i.test(termNumberOrLabel)
      ? normalizeTermLabel(termNumberOrLabel.replace(/\s+\d{4}(\/\d{4})?$/, '').trim())
      : labelFromTermNumber(termNumberOrLabel);
  return formatAcademicSession({ termLabel: term, periodLabel: period });
}
