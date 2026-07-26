import { describe, expect, it } from 'vitest';
import { cleanStringArray } from './narrative';

/**
 * The model does not always answer a list field with sentences. The prompt asks
 * each concern to name its evidence, its action and its checkpoint, so it
 * sometimes returns those as object fields instead.
 */
describe('cleanStringArray', () => {
  it('never emits "[object Object]" into a report', () => {
    // This was live: `.map(String)` turned a structured concern into the literal
    // text "[object Object]", which then passed the non-empty filter and printed.
    const result = cleanStringArray([{ evidence: 'Coverage was 80%.', action: 'Review pacing.' }]);
    expect(result.join(' ')).not.toContain('[object Object]');
    expect(result[0]).toBe('Coverage was 80%. Review pacing.');
  });

  it('does not repeat a field the prose already stated', () => {
    // The action routinely restates the checkpoint, which read as
    // "...the start of the Second Term. Start of Second Term".
    const result = cleanStringArray([{
      action: 'We will review this at the start of the Second Term.',
      checkpoint: 'Start of the Second Term',
    }]);
    expect(result[0]).toBe('We will review this at the start of the Second Term.');
  });

  it('keeps plain strings untouched', () => {
    expect(cleanStringArray(['One.', '  Two.  '])).toEqual(['One.', 'Two.']);
  });

  it('drops entries with no usable text rather than stringifying them', () => {
    expect(cleanStringArray([null, undefined, {}, { nested: { deep: 'x' } }, ''])).toEqual([]);
  });

  it('accepts numbers and caps the list at six', () => {
    expect(cleanStringArray([1, 2])).toEqual(['1', '2']);
    expect(cleanStringArray(Array.from({ length: 10 }, (_, i) => `item ${i}`))).toHaveLength(6);
  });

  it('returns nothing for a non-array', () => {
    expect(cleanStringArray('nope')).toEqual([]);
    expect(cleanStringArray(null)).toEqual([]);
  });
});
