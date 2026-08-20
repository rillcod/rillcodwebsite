import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Pages that must use centralized session helpers — no ad-hoc term/year logic. */
const SESSION_CRITICAL_PAGES = [
  'app/dashboard/reports/builder/page.tsx',
  'app/dashboard/results/page.tsx',
  'app/dashboard/academic/results/page.tsx',
  'app/dashboard/grades/page.tsx',
  'app/dashboard/grading/page.tsx',
  'app/dashboard/lesson-plans/page.tsx',
  'app/dashboard/progression/panel.tsx',
] as const;

const SESSION_CRITICAL_API_ROUTES = [
  'app/api/reports/batch-sync/route.ts',
  'app/api/academic-spine/results/route.ts',
  'app/api/progress-reports/route.ts',
] as const;

const API_SESSION_MARKERS = [
  '@/lib/reports/session-workflows',
  '@/lib/reports/session-scope',
  '@/lib/reports/session',
  'resolveSessionForWrite',
  'resolveClassReportSession',
];

const REQUIRED_IMPORT_MARKERS = [
  '@/lib/reports/session-scope',
  '@/lib/reports/session-workflows',
  '@/lib/reports/session',
];

/** Inline session comparisons that belong in session-workflows / session-scope. */
const FORBIDDEN_INLINE_PATTERNS = [
  /report_term\s*===\s*confirmedPeriod\.term\s*&&\s*report_period\s*===\s*confirmedPeriod\.year/,
  /\.report_term\s*===\s*\w+\.term\s*&&\s*\w+\.report_period\s*===\s*\w+\.year/,
  /isStaleAcademicSession\(\s*adoptedTerm/,
];

function readPage(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('session architecture guards', () => {
  for (const page of SESSION_CRITICAL_PAGES) {
    it(`${page} imports centralized session module`, () => {
      const source = readPage(page);
      const hasCentralImport = REQUIRED_IMPORT_MARKERS.some((marker) => source.includes(marker));
      expect(hasCentralImport, `${page} must import session-scope, session-workflows, or session`).toBe(true);
    });
  }

  for (const page of SESSION_CRITICAL_PAGES) {
    it(`${page} avoids forbidden inline session comparisons`, () => {
      const source = readPage(page);
      for (const pattern of FORBIDDEN_INLINE_PATTERNS) {
        expect(source, `${page} must not match ${pattern}`).not.toMatch(pattern);
      }
    });
  }

  it('session-workflows is exported from session barrel', () => {
    const barrel = readFileSync(join(ROOT, 'lib/reports/session.ts'), 'utf8');
    expect(barrel).toContain("export * from './session-workflows'");
  });

  for (const route of SESSION_CRITICAL_API_ROUTES) {
    it(`${route} uses centralized session resolution`, () => {
      const source = readPage(route);
      const hasCentral = API_SESSION_MARKERS.some((marker) => source.includes(marker));
      expect(hasCentral, `${route} must resolve session through central helpers`).toBe(true);
    });
  }
});
