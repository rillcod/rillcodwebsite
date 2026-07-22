import { describe, expect, it } from 'vitest';
import { fetchAllReportRows } from './paginated-query';

describe('fetchAllReportRows', () => {
  it('loads every page instead of silently truncating records', async () => {
    const source = Array.from({ length: 2505 }, (_, id) => ({ id }));
    const result = await fetchAllReportRows(
      async (from, to) => ({ data: source.slice(from, to + 1), error: null }),
      1000,
    );
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2505);
  });
});
