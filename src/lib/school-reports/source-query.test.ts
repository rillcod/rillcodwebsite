import { describe, expect, it } from 'vitest';
import { hasRequiredSourceFailures, recordSource } from './source-query';

describe('source-query ledger', () => {
  it('records failed required sources', () => {
    const status = recordSource('students', {
      error: { message: 'timeout' },
      required: true,
    });
    expect(status.status).toBe('failed');
    expect(status.required).toBe(true);
    expect(hasRequiredSourceFailures([status])).toBe(true);
  });

  it('marks empty optional sources without blocking', () => {
    const status = recordSource('attendance', { rows: [], required: false });
    expect(status.status).toBe('empty');
    expect(hasRequiredSourceFailures([status])).toBe(false);
  });

  it('marks capped rows as partial', () => {
    const status = recordSource('submissions', {
      rows: Array.from({ length: 10000 }, (_, i) => ({ id: i })),
      cap: 10000,
    });
    expect(status.status).toBe('partial');
    expect(status.capped).toBe(true);
  });
});
