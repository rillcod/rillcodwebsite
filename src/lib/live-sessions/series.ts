import type { SupabaseClient } from '@supabase/supabase-js';
import { generateOccurrences, type SeriesPattern, type SeriesWindow } from './recurrence';

/**
 * Turning a recurring series into real `live_sessions` rows.
 *
 * Occurrences are materialised rather than computed on read because everything else in the
 * feature keys off a concrete session id: attendance, recordings, polls, Q&A, breakout rooms
 * and live_session_removals. A virtual occurrence has nothing for those to reference.
 *
 * Only a rolling horizon is created, not the whole term, so that editing a series affects the
 * sessions nobody has joined yet without having to rewrite hundreds of rows.
 */

/** How far ahead the cron keeps the calendar populated. */
export const MATERIALISE_HORIZON_DAYS = 21;

export interface SeriesRow extends SeriesPattern, SeriesWindow {
  id: string;
  title: string;
  description: string | null;
  host_id: string;
  school_id: string | null;
  program_id: string | null;
  platform: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  term_id: string | null;
  academic_terms?: { start_date: string | null; end_date: string | null } | null;
}

export interface MaterialiseResult {
  seriesConsidered: number;
  created: number;
  skipped: number;
  errors: string[];
}

/** Postgres unique-violation — the idempotency index doing its job, not a failure. */
function isDuplicate(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '23505' || /duplicate key|uq_live_sessions_series_slot/i.test(err.message ?? '');
}

/**
 * Create any missing occurrences for every active series, up to the horizon.
 *
 * Safe to run on every cron tick: existing occurrences are read first and diffed, and the
 * partial unique index on (series_id, scheduled_at) is the backstop if two runs overlap.
 */
export async function materialiseSeries(
  admin: SupabaseClient,
  opts: { now?: Date; horizonDays?: number } = {},
): Promise<MaterialiseResult> {
  const now = opts.now ?? new Date();
  const horizonDays = opts.horizonDays ?? MATERIALISE_HORIZON_DAYS;
  const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const result: MaterialiseResult = { seriesConsidered: 0, created: 0, skipped: 0, errors: [] };

  const { data: series, error } = await (admin as any)
    .from('live_session_series')
    .select('*, academic_terms:term_id(start_date, end_date)')
    .eq('is_active', true);

  if (error) {
    result.errors.push(`load series: ${error.message}`);
    return result;
  }

  for (const s of (series ?? []) as SeriesRow[]) {
    result.seriesConsidered++;

    const occurrences = generateOccurrences(
      {
        weekdays: s.weekdays ?? [],
        start_time: s.start_time,
        timezone: s.timezone,
        duration_minutes: s.duration_minutes,
      },
      {
        term_start: s.academic_terms?.start_date ?? null,
        term_end: s.academic_terms?.end_date ?? null,
        starts_on: s.starts_on ?? null,
        ends_on: s.ends_on ?? null,
      },
      { from: now, until },
    );
    if (occurrences.length === 0) continue;

    // What already exists in this range — so a 15-minute cron doesn't re-insert every tick.
    const { data: existing, error: exErr } = await (admin as any)
      .from('live_sessions')
      .select('scheduled_at')
      .eq('series_id', s.id)
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', until.toISOString());

    if (exErr) {
      result.errors.push(`${s.id}: ${exErr.message}`);
      continue;
    }

    const taken = new Set((existing ?? []).map((r: any) => new Date(r.scheduled_at).getTime()));
    const missing = occurrences.filter((d) => !taken.has(d.getTime()));
    result.skipped += occurrences.length - missing.length;
    if (missing.length === 0) continue;

    const rows = missing.map((at) => ({
      series_id: s.id,
      title: s.title,
      description: s.description ?? null,
      host_id: s.host_id,
      school_id: s.school_id ?? null,
      program_id: s.program_id ?? null,
      platform: s.platform ?? 'other',
      session_url: null,              // in-app LiveKit; the room is created on go-live
      scheduled_at: at.toISOString(),
      duration_minutes: s.duration_minutes ?? 60,
      status: 'scheduled',
    }));

    const { error: insErr } = await (admin as any).from('live_sessions').insert(rows);
    if (!insErr) {
      result.created += rows.length;
      continue;
    }

    // A concurrent run got there first. Retry individually so one clash doesn't lose the
    // whole batch.
    if (!isDuplicate(insErr)) {
      result.errors.push(`${s.id}: ${insErr.message}`);
      continue;
    }
    for (const row of rows) {
      const { error: oneErr } = await (admin as any).from('live_sessions').insert(row);
      if (!oneErr) result.created++;
      else if (isDuplicate(oneErr)) result.skipped++;
      else result.errors.push(`${s.id}: ${oneErr.message}`);
    }
  }

  return result;
}

/**
 * Drop future, unstarted occurrences of a series — used when a series is edited or stopped.
 * Only touches sessions nobody has begun: a class that already ran is history, not a plan.
 */
export async function clearFutureOccurrences(
  admin: SupabaseClient,
  seriesId: string,
  from: Date = new Date(),
): Promise<number> {
  const { data, error } = await (admin as any)
    .from('live_sessions')
    .delete()
    .eq('series_id', seriesId)
    .eq('status', 'scheduled')
    .gt('scheduled_at', from.toISOString())
    .select('id');
  if (error) {
    console.warn('[live-sessions] clearFutureOccurrences', seriesId, error.message);
    return 0;
  }
  return (data ?? []).length;
}
