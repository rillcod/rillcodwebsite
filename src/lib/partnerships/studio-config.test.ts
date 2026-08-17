import { describe, expect, it } from 'vitest';
import { normaliseStudioConfig } from './studio-config';

describe('normaliseStudioConfig', () => {
  it('drops leftover copy so a second editor cannot overlay the narrative', () => {
    const next = normaliseStudioConfig({
      copy: { headline: 'A second editor was here', opening: 'Not this opening.' },
      photos: ['/images/x.jpg'],
    });
    expect(next.copy).toEqual({});
    expect(next.photos).toEqual(['/images/x.jpg']);
  });
});
