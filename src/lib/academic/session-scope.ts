import { liveAcademicSession } from '@/lib/reports/academic-period';

export type StudentSessionStatus =
  | 'confirmed_current'
  | 'carryover_unconfirmed'
  | 'withdrawn';

export interface SessionBoundary {
  periodLabel: string;
  termLabel: string;
  previousPeriodLabel: string | null;
  startYear: number | null;
  sessionStartIso: string;
  sessionStartMs: number;
}

const WITHDRAWN_ROSTER_STATUSES = new Set([
  'withdrawn',
  'ended',
  'removed',
  'completed',
]);

/**
 * Returns the effective timestamp (ms) of a `class_term_rosters` row so duplicate
 * rows across terms for the same `(class_id, student_id)` always resolve to the
 * most recent action (whether reinstatement, enrollment, or withdrawal).
 */
export function rosterRowEffectiveMs(
  row: {
    status?: string | null;
    started_at?: string | null;
    reinstated_at?: string | null;
    ended_at?: string | null;
  } | null | undefined,
): number {
  if (!row) return -1;
  const status = String(row.status ?? '').trim().toLowerCase();
  const startMs = Date.parse(row.reinstated_at || row.started_at || '') || 0;
  if (WITHDRAWN_ROSTER_STATUSES.has(status)) {
    const endMs = Date.parse(row.ended_at || '') || 0;
    return Math.max(endMs, startMs);
  }
  return startMs;
}

/**
 * Given an existing roster row and a candidate roster row for the same student,
 * returns true when `candidate` should replace `existing` (preferring rows that
 * match the student's live `class_id`, then the row with the latest effective timestamp).
 */
export function shouldReplaceRosterRow(
  existing: {
    class_id?: string | null;
    status?: string | null;
    started_at?: string | null;
    reinstated_at?: string | null;
    ended_at?: string | null;
  } | null | undefined,
  candidate: {
    class_id?: string | null;
    status?: string | null;
    started_at?: string | null;
    reinstated_at?: string | null;
    ended_at?: string | null;
  },
  liveClassId?: string | null,
): boolean {
  if (!existing) return true;
  if (liveClassId) {
    const candMatches = candidate.class_id === liveClassId;
    const exMatches = existing.class_id === liveClassId;
    if (candMatches && !exMatches) return true;
    if (!candMatches && exMatches) return false;
  }
  const candMs = rosterRowEffectiveMs(candidate);
  const exMs = rosterRowEffectiveMs(existing);
  if (candMs !== exMs) return candMs > exMs;
  const candWithdrawn = WITHDRAWN_ROSTER_STATUSES.has(String(candidate.status ?? '').trim().toLowerCase());
  const exWithdrawn = WITHDRAWN_ROSTER_STATUSES.has(String(existing.status ?? '').trim().toLowerCase());
  return candWithdrawn && !exWithdrawn;
}

/**
 * Single source of truth for the current academic session boundary.
 * All roster, class, intake, report, and accountability filters derive their
 * current-vs-prior cutoff here so prior sessions never bleed into live work.
 */
export function getSessionBoundary(periodOverride?: string | null): SessionBoundary {
  const live = liveAcademicSession();
  const periodLabel = (periodOverride?.trim() || live.periodLabel).trim();
  const match = /^(\d{4})\s*\/\s*(\d{2,4})$/.exec(periodLabel);
  if (match) {
    const startYear = Number(match[1]);
    // Nigerian & international academic year begins September 1 of startYear
    // (matching academic_terms.start_date = YYYY-09-01; August is still 3rd Term / Summer).
    const sessionStartMs = Date.UTC(startYear, 8, 1, 0, 0, 0, 0);
    return {
      periodLabel,
      termLabel: live.termLabel,
      previousPeriodLabel: `${startYear - 1}/${startYear}`,
      startYear,
      sessionStartIso: new Date(sessionStartMs).toISOString(),
      sessionStartMs,
    };
  }
  const fallbackMs = Date.now() - 120 * 24 * 60 * 60 * 1000;
  return {
    periodLabel,
    termLabel: live.termLabel,
    previousPeriodLabel: null,
    startYear: null,
    sessionStartIso: new Date(fallbackMs).toISOString(),
    sessionStartMs: fallbackMs,
  };
}

/**
 * Deterministic classifier separating current-session students from unconfirmed
 * prior-session carryovers and withdrawn/archived records.
 */
export function classifyStudentSessionStatus(
  student: {
    is_active?: boolean | null;
    created_at?: string | null;
    metadata?: Record<string, any> | null;
  },
  rosterRow: {
    status?: string | null;
    term_id?: string | null;
    started_at?: string | null;
    reinstated_at?: string | null;
  } | null | undefined,
  opts: {
    canonicalTermId?: string | null;
    boundary?: SessionBoundary;
  } = {},
): StudentSessionStatus {
  const boundary = opts.boundary ?? getSessionBoundary();
  const rosterStatus = String(rosterRow?.status ?? '').trim().toLowerCase();

  if (student.is_active === false || WITHDRAWN_ROSTER_STATUSES.has(rosterStatus)) {
    return 'withdrawn';
  }

  const meta =
    student.metadata && typeof student.metadata === 'object'
      ? (student.metadata as Record<string, any>)
      : {};

  const confirmedSession = String(meta.confirmed_session ?? '').trim();
  const rolloverSession = String(meta.rollover_session ?? '').trim();
  const hasSessionHistory =
    Array.isArray(meta.session_history) &&
    meta.session_history.some((h: any) => String(h?.session ?? '').trim() === boundary.periodLabel);
  if (
    (confirmedSession && confirmedSession === boundary.periodLabel) ||
    (rolloverSession && rolloverSession === boundary.periodLabel) ||
    hasSessionHistory
  ) {
    return 'confirmed_current';
  }

  const createdMs = student.created_at ? Date.parse(student.created_at) : NaN;
  if (Number.isFinite(createdMs) && createdMs >= boundary.sessionStartMs) {
    return 'confirmed_current';
  }

  // Note: never trust `rosterRow.term_id === canonicalTermId` alone without a
  // current-session start/reinstatement timestamp — an August 2026 migration
  // bulk-stamped First Term's term_id onto 780 unconfirmed 3rd-term rosters.
  const effectiveRosterStart = rosterRow?.reinstated_at || rosterRow?.started_at;
  const rosterStartMs = effectiveRosterStart ? Date.parse(effectiveRosterStart) : NaN;
  if (Number.isFinite(rosterStartMs) && rosterStartMs >= boundary.sessionStartMs) {
    return 'confirmed_current';
  }

  return 'carryover_unconfirmed';
}

/**
 * Unified lightweight client/server check: returns true when a student record
 * belongs to the current academic session (confirmed, rolled over, created
 * since session start, or already tagged confirmed_current).
 */
export function isStudentInCurrentSession(
  student: {
    created_at?: string | null;
    metadata?: Record<string, any> | null;
    session_status?: string | null;
  } | null | undefined,
  boundary: SessionBoundary = getSessionBoundary(),
): boolean {
  if (!student) return false;
  if (student.session_status === 'confirmed_current') return true;
  if (student.session_status === 'carryover_unconfirmed' || student.session_status === 'withdrawn') {
    return false;
  }
  const meta =
    student.metadata && typeof student.metadata === 'object'
      ? (student.metadata as Record<string, any>)
      : {};
  if (
    String(meta.confirmed_session ?? '').trim() === boundary.periodLabel ||
    String(meta.rollover_session ?? '').trim() === boundary.periodLabel ||
    (Array.isArray(meta.session_history) &&
      meta.session_history.some((h: any) => String(h?.session ?? '').trim() === boundary.periodLabel))
  ) {
    return true;
  }
  const createdMs = student.created_at ? Date.parse(student.created_at) : NaN;
  return Number.isFinite(createdMs) && createdMs >= boundary.sessionStartMs;
}

/**
 * Partitions any student list into clean, non-overlapping buckets for UI,
 * report denominators, and headcount metrics.
 */
export function partitionStudentsBySession<T extends { session_status?: StudentSessionStatus | string }>(
  students: T[],
): {
  currentSession: T[];
  carryoverUnconfirmed: T[];
  withdrawn: T[];
} {
  const currentSession: T[] = [];
  const carryoverUnconfirmed: T[] = [];
  const withdrawn: T[] = [];

  for (const s of students) {
    if (s.session_status === 'withdrawn') {
      withdrawn.push(s);
    } else if (s.session_status === 'carryover_unconfirmed') {
      carryoverUnconfirmed.push(s);
    } else {
      currentSession.push(s);
    }
  }

  return { currentSession, carryoverUnconfirmed, withdrawn };
}
