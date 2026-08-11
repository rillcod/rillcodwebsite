import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  join(process.cwd(), 'src/app/dashboard/consent-forms/page.tsx'),
  'utf8',
);

describe('consent form collection UX', () => {
  it('shows one KPI summary instead of repeating desktop totals', () => {
    expect(page).toContain('<MobilePageHero');
    expect(page).not.toContain('Stats — desktop detail row');
    expect(page).not.toContain('Clean titles');
  });

  it('keeps secondary and destructive card actions behind progressive disclosure', () => {
    expect(page).toContain('<span>More tools</span>');
    expect(page).toContain('<details className="group border-t');
    const moreTools = page.indexOf('<span>More tools</span>');
    expect(page.indexOf('onClick={() => togglePublic', moreTools)).toBeGreaterThan(moreTools);
    expect(page.indexOf('onClick={() => setConfirmDeleteId', moreTools)).toBeGreaterThan(moreTools);
  });

  it('gives teachers a stable, searchable review queue', () => {
    expect(page).toContain('Consent form work queue');
    expect(page).toContain('Search forms or schools');
    expect(page).toContain("'needs_review', 'Needs review'");
    expect(page).toContain('Forms needing review are kept at the top.');
    expect(page).toContain('visibleForms.map');
    expect(page).toContain('Consent forms are temporarily unavailable. Retry');
  });
});
