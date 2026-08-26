import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/components/layout/DashboardAccessGuard.tsx'),
  'utf8',
);

describe('dashboard access runtime', () => {
  it('keeps session-audit dependencies in the dashboard bundle', () => {
    expect(source).toContain("import { isCapacitorNative } from '@/lib/capacitor/platform'");
    expect(source).toContain("import { createClient } from '@/lib/supabase/client'");
    expect(source).not.toContain("await import('@/lib/capacitor/platform')");
    expect(source).not.toContain("await import('@/lib/supabase/client')");
  });
});
