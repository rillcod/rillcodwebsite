import { describe, expect, it } from 'vitest';
import {
  buildNameLookupMaps,
  findNameDuplicate,
} from './duplicate-name-barricade';
import { duplicateNameKey } from './clean-name';

describe('duplicate name barricade', () => {
  const maps = buildNameLookupMaps([
    { id: '1', full_name: 'John Doe', email: 'john@school.test' },
    { id: '2', full_name: 'Ariel Smith', email: 'ariel@school.test' },
  ]);

  it('blocks exact same name regardless of email', () => {
    const hit = findNameDuplicate(maps, 'John Doe');
    expect(hit?.kind).toBe('exact');
    expect(hit?.hit.email).toBe('john@school.test');
  });

  it('blocks reversed first/last as swap', () => {
    const hit = findNameDuplicate(maps, 'Doe John');
    expect(hit?.kind).toBe('swap');
  });

  it('blocks trailing disambiguator via key', () => {
    const hit = findNameDuplicate(maps, 'John Doe 5');
    expect(hit?.kind).toBe('key');
  });

  it('allows Ariel vs Ariella (twins with different first names)', () => {
    expect(duplicateNameKey('Ariel Smith')).not.toBe(duplicateNameKey('Ariella Smith'));
    expect(findNameDuplicate(maps, 'Ariella Smith')).toBeNull();
  });

  it('allows single-token Ariel vs Ariella', () => {
    expect(findNameDuplicate(maps, 'Ariella')).toBeNull();
  });
});
