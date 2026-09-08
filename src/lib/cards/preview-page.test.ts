import { describe, expect, it } from 'vitest';
import { cardPreviewPage } from './preview-page';

describe('card holder preview pagination', () => {
  it('bounds every page without changing the full export collection', () => {
    const records = Object.freeze(Array.from({ length: 101 }, (_, id) => ({ id })));
    const shown = [];
    for (let page = 1; page <= 5; page++) {
      const result = cardPreviewPage(records, page);
      expect(result.visibleRecords.length).toBeLessThanOrEqual(24);
      shown.push(...result.visibleRecords);
    }
    expect(shown).toEqual(records);
    expect(records).toHaveLength(101);
  });
  it('clamps the page when filtering shrinks the results', () => {
    expect(cardPreviewPage(['student'], 5)).toMatchObject({ currentPage: 1, visibleRecords: ['student'] });
    expect(cardPreviewPage([], 9)).toMatchObject({ currentPage: 1, pageCount: 1, visibleRecords: [] });
    expect(cardPreviewPage(['student'], -1).currentPage).toBe(1);
  });
});
