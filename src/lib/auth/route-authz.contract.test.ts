import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { roleHasCapability } from '@/lib/auth/capabilities';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/**
 * Money-moving routes must ask for manage_finance — not a hand-written
 * role === 'admin' check that drifts when capabilities change.
 */
const FINANCE_MUTATION_ROUTES = [
  'src/app/api/payments/refund/route.ts',
  'src/app/api/payments/refund/retry/route.ts',
  'src/app/api/payments/approve/route.ts',
  'src/app/api/finance/reconciliation/route.ts',
];

describe('finance route capability contract', () => {
  it.each(FINANCE_MUTATION_ROUTES)(
    '%s gates with manage_finance',
    (path) => {
      const source = read(path);
      expect(source).toMatch(/roleHasCapability|denyIfMissingCapability/);
      expect(source).toContain('manage_finance');
      expect(source).not.toMatch(/caller\.role !== ['"]admin['"]/);
      expect(source).not.toMatch(/profile\.role !== ['"]admin['"]/);
      expect(source).not.toMatch(/profile\?\.role !== ['"]admin['"]/);
    },
  );

  it('keeps manage_finance admin-only so the contract stays meaningful', () => {
    expect(roleHasCapability('admin', 'manage_finance')).toBe(true);
    expect(roleHasCapability('teacher', 'manage_finance')).toBe(false);
    expect(roleHasCapability('school', 'manage_finance')).toBe(false);
  });
});
