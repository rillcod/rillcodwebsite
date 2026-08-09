/**
 * Write the sessions a timetable implies, so attendance has something to hang on.
 *
 * Split from the planning rules the way the rest of this codebase splits them:
 * sessions-from-slots.ts decides, this reads and writes. Both the daily sweep
 * and any manual run go through here, so a scheduled run and a hand-triggered
 * one cannot produce different calendars.
 */

import { planSessionsFromSlots, type SessionPlan } from '@/lib/timetable/sessions-from-slots';

type DbClient = { from: (table: string) => any };

export type MaterialiseReport = {
  slotsConsidered: number;
  sessionsCreated: number;
  skipped: SessionPlan['skipped'];
  errors: string[];
};

/**
 * Fill the calendar from today to the end of each class's term.
 *
 * Only slots that name a class take part. The rest are reported — a timetable
 * entry without a class cannot say who to mark present, and inventing an answer
 * would put a register in front of the wrong children.
 */
export async function materialiseTimetableSessions(
  db: DbClient,
  options: { schoolId?: string; horizonDays?: number; now?: Date } = {},
): Promise<MaterialiseReport> {
  const report: MaterialiseReport = {
    slotsConsidered: 0,
    sessionsCreated: 0,
    skipped: [],
    errors: [],
  };
  const now = options.now ?? new Date();

  let slotQuery = db
    .from('timetable_slots')
    .select('id, class_id, day_of_week, start_time, end_time, subject, room, timetables!inner(school_id, is_active)')
    .not('class_id', 'is', null)
    .eq('timetables.is_active', true);
  if (options.schoolId) slotQuery = slotQuery.eq('timetables.school_id', options.schoolId);

  const { data: slots, error: slotError } = await slotQuery;
  if (slotError) {
    report.errors.push(`Could not read the timetable: ${slotError.message}`);
    return report;
  }
  report.slotsConsidered = (slots ?? []).length;
  if (!slots?.length) return report;

  // Each class carries its own term, and a session must not outlive it.
  const classIds = Array.from(new Set(slots.map((row: any) => row.class_id).filter(Boolean)));
  const { data: classes, error: classError } = await db
    .from('classes')
    .select('id, term_id, status, academic_terms(start_date, end_date)')
    .in('id', classIds);
  if (classError) {
    report.errors.push(`Could not read the classes: ${classError.message}`);
    return report;
  }
  const classById = new Map((classes ?? []).map((row: any) => [row.id, row]));

  const { data: existing, error: existingError } = await db
    .from('class_sessions')
    .select('class_id, session_date, start_time')
    .in('class_id', classIds)
    .gte('session_date', now.toISOString().slice(0, 10));
  if (existingError) {
    report.errors.push(`Could not read existing sessions: ${existingError.message}`);
    return report;
  }

  const horizon = new Date(now.getTime() + (options.horizonDays ?? 120) * 86_400_000);

  // Grouped by class because the term window differs per class.
  for (const classId of classIds) {
    const klass: any = classById.get(classId);
    const term = Array.isArray(klass?.academic_terms) ? klass.academic_terms[0] : klass?.academic_terms;
    if (!klass || klass.status === 'archived') continue;
    if (!term?.start_date || !term?.end_date) {
      report.skipped.push({
        slotId: `class:${classId}`,
        reason: 'This class has no term dates, so there is no window to schedule inside.',
      });
      continue;
    }

    const plan = planSessionsFromSlots({
      slots: slots.filter((row: any) => row.class_id === classId),
      existing: (existing ?? []).filter((row: any) => row.class_id === classId),
      window: { term_start: term.start_date, term_end: term.end_date },
      from: now,
      until: horizon,
    });
    report.skipped.push(...plan.skipped);
    if (plan.create.length === 0) continue;

    const { error: insertError } = await db.from('class_sessions').insert(plan.create);
    if (insertError) {
      // One class failing must not stop the rest of the school.
      report.errors.push(`Class ${classId}: ${insertError.message}`);
      continue;
    }
    report.sessionsCreated += plan.create.length;
  }

  return report;
}
