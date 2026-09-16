import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/app/dashboard/card-studio/page.tsx', 'utf8');

describe('Card Studio workflow wiring', () => {
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
