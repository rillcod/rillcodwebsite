import { describe, expect, it } from 'vitest';
import { requireSupabaseResult, requireSupabaseWrite } from './require-result';

describe('Supabase administrative result guard', () => {
  it('returns successful data', async () => {
    await expect(requireSupabaseResult(
      Promise.resolve({ data: { id: 'row-1' }, error: null }),
      'save row',
    )).resolves.toEqual({ id: 'row-1' });
  });

  it('turns a resolved Supabase error into a catchable failure', async () => {
    await expect(requireSupabaseWrite(
      Promise.resolve({ error: { code: '23505', message: 'duplicate key' } }),
      'create account',
    )).rejects.toThrow('create account [23505]: duplicate key');
  });
});
