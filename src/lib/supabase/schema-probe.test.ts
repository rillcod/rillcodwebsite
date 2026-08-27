import { describe, expect, it, vi } from 'vitest';
import {
  isTransientSchemaProbeError,
  runSchemaProbeWithRetry,
} from './schema-probe';

describe('schema probe transport handling', () => {
  it('recognises gateway failures without hiding real schema errors', () => {
    expect(isTransientSchemaProbeError({ message: '<h1>502 Bad Gateway</h1> cloudflare' })).toBe(true);
    expect(isTransientSchemaProbeError({ code: '503', message: 'Service unavailable' })).toBe(true);
    expect(isTransientSchemaProbeError({ code: '42703', message: 'column does not exist' })).toBe(false);
    expect(isTransientSchemaProbeError({ code: 'PGRST200', message: 'relationship not found' })).toBe(false);
  });

  it('retries a transient failure and accepts the successful replay', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ message: '502 Bad Gateway' })
      .mockResolvedValueOnce(null);
    const wait = vi.fn().mockResolvedValue(undefined);

    const result = await runSchemaProbeWithRetry(run, { wait });

    expect(result).toEqual({ error: null, attempts: 2, transient: false });
    expect(run).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('does not retry a database refusal and reports a persistent gateway failure', async () => {
    const refusal = vi.fn().mockResolvedValue({ code: '42703', message: 'column missing' });
    const gateway = vi.fn().mockResolvedValue({ message: '504 Gateway Timeout' });
    const wait = vi.fn().mockResolvedValue(undefined);

    expect(await runSchemaProbeWithRetry(refusal, { wait })).toMatchObject({
      attempts: 1,
      transient: false,
    });
    expect(await runSchemaProbeWithRetry(gateway, { wait })).toMatchObject({
      attempts: 3,
      transient: true,
    });
  });
});
