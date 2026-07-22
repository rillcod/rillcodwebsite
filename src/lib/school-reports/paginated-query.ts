export function reportPage<T>(query: T, from: number, to: number): PromiseLike<{ data: any[] | null; error: any }> {
  const value = query as any;
  return typeof value.range === 'function'
    ? value.range(from, to)
    : value.limit(to - from + 1);
}

export async function fetchAllReportRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let page = 0; page < 1000; page += 1) {
    const from = page * pageSize;
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return { data: rows, error: null };
  }
  return { data: rows, error: { message: 'Report pagination exceeded the safety page count.' } };
}
