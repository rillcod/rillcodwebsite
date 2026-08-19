export type DataSourceLoadStatus = 'ok' | 'empty' | 'partial' | 'failed';

export type DataSourceStatus = {
  source: string;
  status: DataSourceLoadStatus;
  rowCount: number;
  capped: boolean;
  checkedAt: string;
  message?: string;
  required?: boolean;
};

export type SourceQueryResult<T> = {
  data: T;
  status: DataSourceStatus;
};

const nowIso = () => new Date().toISOString();

/** Wrap a Supabase-style query result into a ledger entry. */
export function recordSource<T>(
  source: string,
  input: {
    error?: { message: string } | null;
    rows?: readonly T[] | null;
    cap?: number;
    required?: boolean;
    checkedAt?: string;
    /** Staff-facing note that should not be replaced by the generic empty/ok copy. */
    message?: string;
  },
): DataSourceStatus {
  const checkedAt = input.checkedAt || nowIso();
  const cap = input.cap ?? 0;
  const rows = input.rows ?? [];
  const rowCount = rows.length;
  const capped = cap > 0 && rowCount >= cap;

  if (input.error) {
    return {
      source,
      status: 'failed',
      rowCount: 0,
      capped: false,
      checkedAt,
      required: input.required,
      message: input.error.message,
    };
  }

  let status: DataSourceLoadStatus = 'ok';
  if (rowCount === 0) status = 'empty';
  else if (capped) status = 'partial';

  return {
    source,
    status,
    rowCount,
    capped,
    checkedAt,
    required: input.required,
    message:
      input.message ||
      (status === 'partial'
        ? `Results capped at ${cap} rows — figures may be incomplete.`
        : status === 'empty'
          ? 'No records found for this scope.'
          : undefined),
  };
}

export function sourceQuery<T>(
  source: string,
  input: {
    error?: { message: string } | null;
    rows?: readonly T[] | null;
    cap?: number;
    required?: boolean;
  },
): SourceQueryResult<T[]> {
  const status = recordSource(source, input);
  return { data: [...(input.rows ?? [])], status };
}

export function hasRequiredSourceFailures(sources: DataSourceStatus[] | null | undefined): boolean {
  return (sources ?? []).some((row) => row.required && row.status === 'failed');
}

export function failedRequiredSources(sources: DataSourceStatus[] | null | undefined): string[] {
  return (sources ?? [])
    .filter((row) => row.required && row.status === 'failed')
    .map((row) => row.source);
}

export function sourceFailureMessages(sources: DataSourceStatus[] | null | undefined): string[] {
  return (sources ?? [])
    .filter((row) => row.status === 'failed')
    .map((row) => `${row.source}: ${row.message || 'query failed'}`);
}

/** Draft snapshots older than this should be refreshed before they are treated as live. */
export const DRAFT_SNAPSHOT_STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export function isDraftSnapshotStale(generatedAt?: string | null, now = Date.now()): boolean {
  if (!generatedAt) return true;
  const at = Date.parse(generatedAt);
  if (!Number.isFinite(at)) return true;
  return now - at > DRAFT_SNAPSHOT_STALE_AFTER_MS;
}

export function attendanceSourceMessage(rollCount: number, resultEntryCount: number): string {
  if (rollCount || resultEntryCount) {
    return `${rollCount} class-roll mark${rollCount === 1 ? '' : 's'} and ${resultEntryCount} result-entry attendance score${resultEntryCount === 1 ? '' : 's'}.`;
  }
  return 'No class-roll marks or Report Builder attendance scores for this term yet.';
}

export function snapshotAgeLabel(generatedAt?: string | null, now = Date.now()): string | null {
  if (!generatedAt) return null;
  const at = Date.parse(generatedAt);
  if (!Number.isFinite(at)) return null;
  const hours = Math.max(0, (now - at) / 3_600_000);
  if (hours < 1) return 'less than an hour ago';
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
