/**
 * Insert learner and parent notifications without duplicating them on a retry.
 *
 * A notification and the thing that caused it are separate side effects. The
 * cause usually succeeds first — an invoice is raised, a report is published, a
 * week is generated — and then the notification is written. If the caller is
 * retried, or a scheduled job fires twice, the cause is normally guarded but the
 * notification is not, so the family gets the same message again.
 *
 * Migration 20260929000120 added `source_type`, `source_id` and a UNIQUE
 * `idempotency_key` to public.notifications for exactly this. This module is how
 * the rest of the app uses them.
 *
 * ── Which callers need this ──────────────────────────────────────────────────
 *
 * Anything that can run more than once for the same real-world event:
 *
 *   - cron jobs, which retry by design, and which this platform runs on
 *     cron-job.org where a missed response is re-fired;
 *   - sweeps and repair passes that re-examine the same rows daily;
 *   - post-payment and activation flows, which are already retried by their own
 *     sweeps because the step after a payment can fail.
 *
 * A notification a person triggers by pressing a button does not need it. The
 * duplicate there is a double-click, it is visible to the person who caused it,
 * and adding a key would mean inventing a version for an action that has none.
 *
 * ── The key ──────────────────────────────────────────────────────────────────
 *
 * source type, source id, recipient, and a version. The version is what allows a
 * *deliberate* repeat: re-publishing a report genuinely should notify again, so
 * the caller passes something that changes when the event does — an updated_at,
 * a term label, a run date. Omit it and the event can only ever notify once.
 */

export type NotificationSource = {
  /** The business event, e.g. 'invoice_reminder'. Stored on the row. */
  sourceType: string;
  /** The entity that caused it. Correlation evidence, not a foreign key. */
  sourceId: string;
  /**
   * What makes a legitimate repeat distinct from a retry. Pass a value that
   * changes only when the event genuinely recurs — an updated_at, a term label,
   * a billing period. Omitted means "notify at most once, ever".
   */
  version?: string | null;
};

/**
 * The idempotency key for one recipient of one event.
 *
 * Colons separate the parts and each part has its own colons stripped, so a
 * value containing one cannot shift the boundaries and collide with a
 * different event.
 */
export function notificationKey(source: NotificationSource, userId: string): string {
  const part = (value: string | null | undefined) =>
    String(value ?? '').replace(/:/g, '-').trim() || 'none';
  return [
    part(source.sourceType),
    part(source.sourceId),
    part(userId),
    part(source.version ?? 'once'),
  ].join(':');
}

type NotificationRow = Record<string, unknown> & { user_id?: string | null };

/** Rows stamped with their source and key, ready to upsert. */
export function stampNotifications<T extends NotificationRow>(
  rows: T[],
  source: NotificationSource,
): Array<T & { source_type: string; source_id: string; idempotency_key: string }> {
  return rows.map((row) => ({
    ...row,
    source_type: source.sourceType,
    source_id: source.sourceId,
    idempotency_key: notificationKey(source, String(row.user_id ?? '')),
  }));
}

export type DeliverOnceResult = {
  /** Rows that were genuinely new. Excludes anything a retry skipped. */
  created: number;
  /** Recipients of the new rows — push should follow these, not the whole batch. */
  createdUserIds: string[];
  skipped: number;
  error?: string;
};

/**
 * Insert notifications, skipping any this event already delivered.
 *
 * Batched, because a school-wide notification is hundreds of rows and a single
 * statement that large is refused. `ignoreDuplicates` makes the unique index do
 * the work: a retry inserts nothing and reports nothing created, which is what
 * lets a caller send push only to people who genuinely have something new.
 */
export async function deliverNotificationsOnce(
  db: any,
  rows: NotificationRow[],
  source: NotificationSource,
  options: { batchSize?: number } = {},
): Promise<DeliverOnceResult> {
  if (!rows.length) return { created: 0, createdUserIds: [], skipped: 0 };

  const stamped = stampNotifications(rows, source);
  const batchSize = options.batchSize ?? 50;
  const createdUserIds: string[] = [];

  for (let i = 0; i < stamped.length; i += batchSize) {
    const batch = stamped.slice(i, i + batchSize);
    const { data, error } = await db
      .from('notifications')
      .upsert(batch, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('user_id');

    if (error) {
      // Partial delivery is reported rather than thrown. These callers are
      // usually finishing something that already succeeded — a payment, a
      // publication — and failing them on the notification would undo or retry
      // the wrong half.
      return {
        created: createdUserIds.length,
        createdUserIds,
        skipped: stamped.length - createdUserIds.length,
        error: error.message ?? String(error),
      };
    }

    for (const row of data ?? []) {
      if (typeof row?.user_id === 'string') createdUserIds.push(row.user_id);
    }
  }

  return {
    created: createdUserIds.length,
    createdUserIds,
    skipped: stamped.length - createdUserIds.length,
  };
}
