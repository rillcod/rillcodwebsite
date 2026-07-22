/** Page through a Supabase query until all rows are loaded (PostgREST default cap is 1000). */
export async function fetchAllSupabaseRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = 500,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { data: rows, error: null };
  }
  return { data: rows, error: { message: 'Query pagination exceeded the safety page count.' } };
}
