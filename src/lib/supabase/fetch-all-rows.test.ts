import { describe, expect, it } from 'vitest';
import { fetchAllSupabaseRows } from './fetch-all-rows';

describe('fetchAllSupabaseRows', () => {
  it('loads every page until a short final batch', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      Array.from({ length: 250 }, (_, i) => ({ id: 1000 + i })),
    ];
    let call = 0;
    const result = await fetchAllSupabaseRows<{ id: number }>((from, to) => {
      const batch = pages[call] ?? [];
      call += 1;
      expect(from).toBe((call - 1) * 1000);
      expect(to).toBe(from + 999);
      return Promise.resolve({ data: batch, error: null });
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1250);
    expect(call).toBe(2);
  });
});
