import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { errorHandler, generateRequestId } from './error.proxy';
import { AppError, ValidationError, NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * The request id is the only thing connecting a customer saying "it broke" to the
 * line in the log that says why. It was being generated after the error had already
 * been logged without it, so it pointed at nothing.
 */

let logged: Array<{ error: Error; context?: Record<string, unknown> }>;

beforeEach(() => {
  logged = [];
  vi.spyOn(logger, 'logError').mockImplementation((error, context) => {
    logged.push({ error, context: context as Record<string, unknown> });
  });
});

afterEach(() => vi.restoreAllMocks());

const body = async (res: Response) => res.json() as Promise<Record<string, unknown>>;

describe('errorHandler', () => {
  it('returns the same request id it logged', async () => {
    const res = errorHandler(new NotFoundError('No such class'));
    const json = await body(res);

    expect(json.requestId, 'no reference was given to the customer').toBeTruthy();
    expect(logged).toHaveLength(1);
    expect(
      logged[0].context?.requestId,
      'the log line carries a different reference than the customer was given',
    ).toBe(json.requestId);
  });

  it('gives a different reference to each failure', async () => {
    const a = await body(errorHandler(new NotFoundError('one')));
    const b = await body(errorHandler(new NotFoundError('two')));
    expect(a.requestId).not.toBe(b.requestId);
  });

  it('shows an operational message, because it was written for the customer', async () => {
    const res = errorHandler(new ValidationError('That form has already been signed'));
    const json = await body(res);

    expect(res.status).toBe(400);
    expect(json.error).toBe('That form has already been signed');
    expect(logged[0].context?.type).toBe('operational');
  });

  it('withholds a non-operational message, because it was written for us', async () => {
    const leaky = new AppError('column portal_users.tenant_id does not exist', 500, false);
    const res = errorHandler(leaky);
    const json = await body(res);

    expect(json.error).not.toContain('portal_users');
    expect(json.error).toContain('reference');
    // The detail is kept, just not shown.
    expect(logged[0].error.message).toContain('portal_users.tenant_id');
    expect(logged[0].context?.type).toBe('unexpected');
  });

  it('withholds an unhandled error message too', async () => {
    const res = errorHandler(new Error('ECONNREFUSED 10.0.0.4:5432'));
    const json = await body(res);

    expect(res.status).toBe(500);
    expect(json.error).not.toContain('ECONNREFUSED');
    expect(logged[0].error.message).toContain('ECONNREFUSED');
    expect(logged[0].context?.type).toBe('unhandled');
  });

  it('keeps the status code of a non-operational AppError', async () => {
    const res = errorHandler(new AppError('internal detail', 503, false));
    expect(res.status).toBe(503);
  });

  it('passes validation field errors through, since the customer needs them', async () => {
    const res = errorHandler(new ValidationError('Check the form', { email: 'Enter an email address' }));
    const json = await body(res);
    expect(json.errors).toEqual({ email: 'Enter an email address' });
  });
});

describe('generateRequestId', () => {
  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 200 }, generateRequestId));
    expect(ids.size).toBe(200);
  });
});
