import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app/dashboard/card-studio/page.tsx', 'utf8');

describe('Card Studio workflow wiring', () => {
  it('respects selection when creating missing cards', () => {
    expect(page).toContain('bulkIssueList(cardActionScope(filtered, selectedIds, dbCardsMap).missing)');
    expect(page).toContain('aria-label="Card actions"');
    expect(page).toContain('Show filters');
    expect(page).not.toContain('Filters & actions');
  });
  it('stops before creating cards when existing cards cannot be checked', () => {
    const route = readFileSync('src/app/api/cards/issue-missing/route.ts', 'utf8');
    expect(route.indexOf('if (error)')).toBeLessThan(route.indexOf('const missing ='));
    expect(route).toContain('No new cards were created. Please retry.');
  });
  it('checks save rejection before announcing success and restricts global saves', () => {
    const save = page.slice(page.indexOf('const handleSave ='), page.indexOf('const handleReset ='));
    expect(save).toContain('if (!isAdmin || savingDesign || configLoading || configError) return;');
    expect(save.indexOf('if (!response.ok)')).toBeLessThan(save.indexOf('setSaved(true)'));
  });
  it('keeps resetting a preview separate from saving the shared design', () => {
    const reset = page.slice(page.indexOf('const handleReset ='), page.indexOf('const handlePrintSample ='));
    expect(reset).not.toContain('fetch(');
    expect(reset).toContain('setCfg(resetCfg)');
  });
  it('ignores stale card and holder responses and exposes retries', () => {
    expect(page).toContain('if (request !== cardsRequest.current) return;');
    expect(page).toContain('if (request !== holdersRequest.current) return;');
    expect(page).toContain('if (request !== manageDesignRequest.current) return;');
    expect(page).toContain('Retry cards');
    expect(page).toContain('Retry design');
  });
});
