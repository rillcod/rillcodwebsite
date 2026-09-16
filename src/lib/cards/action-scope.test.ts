import { describe, expect, it } from 'vitest';
import { cardActionScope } from './action-scope';

describe('card actions follow the chosen people', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'hidden', isHidden: true }];
  const cards = new Map([['b', {}]]);
  it('creates missing cards only for selected people', () => {
    const scope = cardActionScope(people, new Set(['b', 'c']), cards);
    expect(scope.people.map(p => p.id)).toEqual(['b', 'c']);
    expect(scope.missing.map(p => p.id)).toEqual(['c']);
  });
  it('uses the shown people when no selection exists and excludes hidden accounts', () => {
    expect(cardActionScope(people, new Set(), cards).missing.map(p => p.id)).toEqual(['a', 'c']);
  });
  it('does not replace existing cards or fall back to everyone for a stale selection', () => {
    expect(cardActionScope(people, new Set(['b']), cards).missing).toEqual([]);
    expect(cardActionScope(people, new Set(['gone']), cards).people).toEqual([]);
  });
});
