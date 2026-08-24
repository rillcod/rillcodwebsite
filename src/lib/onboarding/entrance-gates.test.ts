import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('family entrance gate wiring', () => {
  it('uses one active-parent gate for the portal and school-form worklist', () => {
    const portal = source('src/app/api/parents/portal/route.ts');
    const forms = source('src/app/api/parents/pending-consent/route.ts');

    expect(portal).toContain("import { requireActiveParent } from '@/lib/parents/access'");
    expect(forms).toContain("import { requireActiveParent } from '@/lib/parents/access'");
    expect(portal).toContain('await requireActiveParent(supabase, admin)');
    expect(forms).toContain('await requireActiveParent(supabase, admin)');
    expect(portal).not.toContain('function requireParent(');
  });

  it('does not silently translate form, link or learner-query failures into an empty worklist', () => {
    const forms = source('src/app/api/parents/pending-consent/route.ts');

    expect(forms).toContain('if (linksError)');
    expect(forms).toContain('if (learnerError) throw learnerError');
    expect(forms).toContain('accessUnaffected: true');
    expect(forms).toContain('return NextResponse.json({ pending, available: true })');
  });

  it('keeps a consent-enrichment outage visible but non-blocking on verified public reports', () => {
    const route = source('src/app/api/public/student/[id]/reports/route.ts');
    const page = source('src/app/result-check/[code]/page.tsx');

    expect(route).toContain('consentStatusAvailable = false');
    expect(route).toContain('consentStatusAvailable,');
    expect(route).toContain('if (consentStatusAvailable)');
    expect(route).toContain('consent parent-link repair failed (non-fatal)');
    expect(page).toContain('data.consentStatusAvailable === false');
    expect(page).toContain('verified report access is unaffected');
  });

  it('gives the parent visible retry states instead of false empty results', () => {
    const page = source('src/app/dashboard/my-children/page.tsx');

    expect(page).toContain('if (!res.ok)');
    expect(page).toContain('if (!r.ok)');
    expect(page).toContain('summaryError');
    expect(page).toContain('consentError');
    expect(page).toContain('activityError');
    expect(page).toContain('!loading && !summaryError && children.length === 0');
  });
});
