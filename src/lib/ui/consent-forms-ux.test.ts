import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  join(process.cwd(), 'src/app/dashboard/consent-forms/page.tsx'),
  'utf8',
);
const responsesPage = readFileSync(
  join(process.cwd(), 'src/app/dashboard/consent-forms/[id]/responses/page.tsx'),
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

describe('teacher consent response workflow', () => {
  it('uses one responsive card workspace with a clear next step', () => {
    expect(responsesPage).toContain('One scannable card workflow across phone, tablet and desktop.');
    expect(responsesPage).toContain('getLeadWorkflowState');
    expect(responsesPage).toContain('>Next step</span>');
    expect(responsesPage).toContain('Actions &amp; portal');
    expect(responsesPage).toContain('md:grid-cols-2 xl:grid-cols-3');
  });

  it('prioritizes unfinished work and explains blocked portal setup', () => {
    expect(responsesPage).toContain('<option value="needs_action">Needs action</option>');
    expect(responsesPage).toContain('<option value="contact_details">Contact details needed</option>');
    expect(responsesPage).toContain('Portal setup is paused until a valid email is added.');
    expect(responsesPage).toContain('getLeadWorkflowState(a).rank - getLeadWorkflowState(b).rank');
  });

  it('turns summary counts into one-tap contact shortcuts', () => {
    expect(responsesPage).toContain("action: () => openLeadQueue('new')");
    expect(responsesPage).toContain("action: () => openLeadQueue('contacted')");
    expect(responsesPage).toContain('action: openPortalLog');
    expect(responsesPage).toContain('Open matching contacts');
  });

  it('keeps secondary tools quiet and exposes load failures', () => {
    expect(responsesPage).toContain('<span>More tools</span>');
    expect(responsesPage).not.toContain('Dedup CRM');
    expect(responsesPage).toContain('Responses are temporarily unavailable');
    expect(responsesPage).toContain('role="alert"');
    expect(responsesPage).toContain('Try again');
  });
});
