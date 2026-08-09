/**
 * Turn a timetable into the class sessions a teacher marks attendance against.
 *
 * The two halves were never joined. A timetable slot knew "Monday 10:00,
 * Scratch, Room 2"; class_sessions knew what a teacher actually held; and
 * attendance hangs off class_sessions. So the system already knew when every
 * lesson was and still made teachers create each session by hand — 115 sessions
 * typed out against 11 slots that could have produced them.
 *
 * Everything downstream is already wired: set_class_session_term_id stamps a
 * session with its class's term, and set_attendance_roster_context resolves each
 * mark to the learner's roster row for that term. Generating the session is the
 * only missing link, which is why this is a small file rather than a subsystem.
 *
 * The dates come from live-sessions/recurrence, which already solves this and
 * solves it better than a fresh attempt did. It walks calendar days in the
 * school's own timezone (Africa/Lagos) rather than adding 24 hours, because "the
 * same wall-clock time tomorrow" is not always 24 hours later — a naive UTC walk
 * puts a Monday 09:00 lesson on Sunday for anyone running behind the school. It
 * also clips to the term window and caps a run, so a mistyped slot cannot flood
 * a calendar.
 */

import {
  generateOccurrences,
  MAX_OCCURRENCES_PER_RUN,
  type SeriesWindow,
} from '@/lib/live-sessions/recurrence';

export type TimetableSlot = {
  id: string;
  class_id: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  subject: string | null;
  room?: string | null;
};

export type PlannedSession = {
  class_id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  title: string;
  location: string | null;
  status: 'scheduled';
  is_active: true;
};

export type ExistingSession = {
  class_id: string;
  session_date: string;
  start_time: string | null;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "monday" / "Monday " / "MONDAY" → 1. Anything else → null. */
export function dayIndex(day: string | null | undefined): number | null {
  if (!day) return null;
  const index = DAYS.findIndex((name) => name.toLowerCase() === String(day).trim().toLowerCase());
  return index >= 0 ? index : null;
}

/** Compare "09:00" and "09:00:00" as the same time. */
export function sameTime(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (value: string | null | undefined) => String(value ?? '').trim().slice(0, 5);
  return norm(a) !== '' && norm(a) === norm(b);
}

export type PlanInput = {
  slots: TimetableSlot[];
  /** Existing sessions for these classes, so nothing is created twice. */
  existing: ExistingSession[];
  /** The term this timetable belongs to — sessions never spill past it. */
  window: SeriesWindow;
  /** Materialisation horizon, normally now → end of term. */
  from: Date;
  until: Date;
  max?: number;
};

export type SessionPlan = {
  create: PlannedSession[];
  /** Slots that cannot generate anything, and why. Reported, never guessed. */
  skipped: Array<{ slotId: string; reason: string }>;
};

/**
 * What the timetable says should exist, minus what already does.
 *
 * A session already on the books is never touched — a teacher may have renamed
 * it, moved the room or written up the topic, and regenerating over that would
 * erase the lesson record to match a template.
 */
export function planSessionsFromSlots(input: PlanInput): SessionPlan {
  const create: PlannedSession[] = [];
  const skipped: SessionPlan['skipped'] = [];

  // Existing sessions keyed by class + date, holding the start times taken.
  const taken = new Map<string, string[]>();
  for (const row of input.existing) {
    const key = `${row.class_id}|${row.session_date}`;
    const list = taken.get(key) ?? [];
    list.push(String(row.start_time ?? ''));
    taken.set(key, list);
  }

  for (const slot of input.slots) {
    if (!slot.class_id) {
      skipped.push({ slotId: slot.id, reason: 'This slot has no class, so there is nobody to mark present.' });
      continue;
    }
    const day = dayIndex(slot.day_of_week);
    if (day === null) {
      skipped.push({ slotId: slot.id, reason: `"${slot.day_of_week}" is not a day of the week.` });
      continue;
    }
    if (!slot.start_time) {
      skipped.push({ slotId: slot.id, reason: 'This slot has no start time.' });
      continue;
    }

    const occurrences = generateOccurrences(
      { weekdays: [day], start_time: slot.start_time },
      input.window,
      { from: input.from, until: input.until, max: input.max ?? MAX_OCCURRENCES_PER_RUN },
    );
    if (occurrences.length === 0) {
      skipped.push({ slotId: slot.id, reason: 'No teaching days fall inside this term for that slot.' });
      continue;
    }

    for (const at of occurrences) {
      // The occurrence is an instant in the school's zone; the session row stores
      // the calendar date the school would call it.
      const date = at.toISOString().slice(0, 10);
      const already = taken.get(`${slot.class_id}|${date}`) ?? [];
      if (already.some((time) => sameTime(time, slot.start_time))) continue;
      create.push({
        class_id: slot.class_id,
        session_date: date,
        start_time: slot.start_time,
        end_time: slot.end_time ?? null,
        title: slot.subject?.trim() || 'Lesson',
        location: slot.room?.trim() || null,
        status: 'scheduled',
        is_active: true,
      });
      already.push(slot.start_time);
      taken.set(`${slot.class_id}|${date}`, already);
    }
  }

  return { create, skipped };
}
