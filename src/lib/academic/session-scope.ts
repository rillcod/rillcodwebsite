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
    // Nigerian & international academic year begins in August/September of startYear.
    const sessionStartMs = Date.UTC(startYear, 7, 1, 0, 0, 0, 0);
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
  if (confirmedSession && confirmedSession === boundary.periodLabel) {
    return 'confirmed_current';
  }

  if (
    opts.canonicalTermId &&
    rosterRow?.term_id === opts.canonicalTermId &&
    rosterStatus === 'active'
  ) {
    return 'confirmed_current';
  }

  const createdMs = student.created_at ? Date.parse(student.created_at) : NaN;
  if (Number.isFinite(createdMs) && createdMs >= boundary.sessionStartMs) {
    return 'confirmed_current';
  }

  const rosterStartMs = rosterRow?.started_at ? Date.parse(rosterRow.started_at) : NaN;
  if (Number.isFinite(rosterStartMs) && rosterStartMs >= boundary.sessionStartMs) {
    return 'confirmed_current';
  }

  return 'carryover_unconfirmed';
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
