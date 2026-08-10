import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeoutOrThrow } from './async-timeout';

describe('withTimeoutOrThrow', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a result that completes before the deadline', async () => {
    await expect(withTimeoutOrThrow(Promise.resolve('ready'), 'Too slow', 100)).resolves.toBe('ready');
  });

  it('rejects with the safe caller message when work remains blocked', async () => {
    vi.useFakeTimers();
    const result = withTimeoutOrThrow(new Promise<never>(() => undefined), 'Please try again', 1_000);
    const assertion = expect(result).rejects.toThrow('Please try again');

    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
  });
});
