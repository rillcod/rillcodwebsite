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
      status === 'partial'
        ? `Results capped at ${cap} rows — figures may be incomplete.`
        : status === 'empty'
          ? 'No records found for this scope.'
          : undefined,
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
