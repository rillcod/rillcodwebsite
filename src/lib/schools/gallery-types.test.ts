import { describe, expect, it } from 'vitest';
import { GALLERY_CATEGORIES } from './gallery-types';
import { MEDIA_CATEGORIES } from '@/lib/partnerships/media-library';

/**
 * The picker and the column have to agree.
 *
 * They did not: the media library offered 'coding', 'videos' and 'competitions'
 * while the database accepts none of those, so any upload filed under them would
 * have been rejected by the CHECK — after the file had already been written to
 * R2. This is the test that keeps the two lists honest, in both directions.
 */
describe('gallery categories', () => {
  it('offers nothing the database will refuse', () => {
    const offered = MEDIA_CATEGORIES.map((c) => c.key).filter((k) => k !== 'all');
    for (const key of offered) {
      expect(GALLERY_CATEGORIES as readonly string[]).toContain(key);
    }
  });

  it('offers everything the database accepts', () => {
    // The other direction matters too: a category nobody can pick is a column
    // value nothing will ever write.
    const offered = new Set(MEDIA_CATEGORIES.map((c) => c.key));
    for (const key of GALLERY_CATEGORIES) {
      expect(offered.has(key)).toBe(true);
    }
  });

  it('keeps "all" as a filter only, never a stored value', () => {
    // 'all' is how the viewer says "no filter". Storing it would violate the
    // CHECK, so it must never appear in the list the column accepts.
    expect(GALLERY_CATEGORIES as readonly string[]).not.toContain('all');
    expect(MEDIA_CATEGORIES.some((c) => c.key === 'all')).toBe(true);
  });
});
