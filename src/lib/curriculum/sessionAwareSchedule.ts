import {
  absoluteCurriculumWeek,
  curriculumPositionFromAbsolute,
  termWeekOrdinal,
  type CurriculumPosition,
  type DeliverySchedule,
} from './deliverySchedule';

export function academicSessionStartYear(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})\s*(?:\/|-)/);
  return match ? Number(match[1]) : null;
}

export function academicSessionDistance(entrySession: unknown, currentSession: unknown): number {
  const entry = academicSessionStartYear(entrySession);
  const current = academicSessionStartYear(currentSession);
  if (entry == null || current == null) return 0;
  return Math.max(0, Math.min(5, current - entry));
}

/**
 * Maps the school's academic calendar to the programme journey. A school term
 * is one programme term by default: a Third Term entry is Programme First Term,
 * and the following First Term is Programme Second Term. Starting in Week 3
 * shifts the first teaching week but does not make the next school term inherit
 * leftover weeks.
 */
export function mapSessionCalendarToCurriculumPosition(input: {
  entryAcademicSession?: string | null;
  currentAcademicSession?: string | null;
  calendarTerm: number;
  calendarWeek: number;
  schedule: DeliverySchedule;
}): CurriculumPosition | null {
  const sessionDistance = academicSessionDistance(input.entryAcademicSession, input.currentAcademicSession);
  const entryTerm = Math.max(1, Math.min(3, Math.floor(input.schedule.entryTerm)));
  const currentTerm = Math.max(1, Math.min(3, Math.floor(input.calendarTerm)));
  const currentWeek = Math.max(1, Math.min(12, Math.floor(input.calendarWeek)));
  const entryWeek = Math.max(1, Math.min(12, Math.floor(input.schedule.entryWeek)));
  const localTermDistance = sessionDistance * 3 + currentTerm - entryTerm;
  if (localTermDistance < 0) return null;
  if (localTermDistance === 0 && currentWeek < entryWeek) return null;

  const weekOffset = localTermDistance === 0 ? currentWeek - entryWeek : currentWeek - 1;
  const base = absoluteCurriculumWeek(
    input.schedule.curriculumYear ?? 1,
    input.schedule.curriculumTerm ?? 1,
    input.schedule.curriculumWeek ?? 1,
  );
  return curriculumPositionFromAbsolute(base + localTermDistance * 12 + weekOffset);
}

/** Kept public for audit tools that compare a raw 36-week calendar cycle. */
export function sessionCalendarOrdinal(sessionDistance: number, term: number, week: number): number {
  return Math.max(0, sessionDistance) * 36 + termWeekOrdinal(term, week);
}

