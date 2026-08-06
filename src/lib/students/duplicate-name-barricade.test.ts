import { describe, expect, it } from 'vitest';
import {
  buildNameLookupMaps,
  findNameDuplicate,
  registerCreatedNameInMaps,
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

describe('near-duplicate: middle name added or dropped', () => {
  const roster = (...names: string[]) =>
    buildNameLookupMaps(names.map((n, i) => ({ id: `id${i}`, full_name: n, email: `e${i}@x.com` })));

  // Every pair below is a real duplicate found at Greenville/Franej, created by
  // two imports two days apart. All ten passed the old barricade silently.
  it.each([
    ['Ebenyi Excel Munachi', 'Excel Ebenyi'],
    ['RUSHDIYA-EMAAN ALASA', 'Rushdiya Alasa'],
    ['Ebenyi Ebenezer Edidiong', 'EBENYI EBENEZER'],
    ['Ogbebor Esosa Nancy', 'Nancy Ogbebor'],
    ['Chibuike Ivan Njoku', 'Chibuike Ivan'],
    ['Apostle kamsi Nwezenagu', 'Kamsi Nwezenagu'],
    ['Johnson Anderson Oghosa', 'Anderson Johnson'],
    ['Obazee kester aisosa', 'Kester Obazee'],
    ['Isabella Musa Efe', 'Isabella Musa'],
    ['Okhomina Ezra Owen', 'Okhomina Ezra'],
  ])('catches %s vs %s', (existing, incoming) => {
    expect(findNameDuplicate(roster(existing), incoming)).not.toBeNull();
  });

  it('still catches the shapes it always caught', () => {
    expect(findNameDuplicate(roster('Maxwell Erese'), 'Maxwell Erese')?.kind).toBe('exact');
    expect(findNameDuplicate(roster('Enoch Ojokoh'), 'Ojokoh Enoch')).not.toBeNull();
  });

  it('does NOT collapse siblings who share only a surname', () => {
    // The whole reason namesAreNearDuplicate demands two matching tokens.
    expect(findNameDuplicate(roster('Ebenyi Excel Munachi'), 'Ebenyi Ebenezer Edidiong')).toBeNull();
    expect(findNameDuplicate(roster('Jordan Odidi'), 'Bethel Odidi')).toBeNull();
  });

  it('does not flag unrelated learners', () => {
    expect(findNameDuplicate(roster('Maxwell Erese'), 'Nancy Ogbebor')).toBeNull();
  });

  it('catches a second variant inside the SAME batch', () => {
    const maps = roster('Maxwell Erese');
    registerCreatedNameInMaps(maps, 'Chibuike Ivan Njoku', { id: 'new', full_name: 'Chibuike Ivan Njoku', email: 'n@x.com' });
    expect(findNameDuplicate(maps, 'Chibuike Ivan')).not.toBeNull();
  });
});

describe('near-duplicate must not block legitimate siblings or twins', () => {
  const roster = (...names: string[]) =>
    buildNameLookupMaps(names.map((n, i) => ({ id: `id${i}`, full_name: n, email: `e${i}@x.com` })));

  it('allows twins whose first names merely resemble each other', () => {
    // Fuzzy matching flagged this pair; exact containment must not.
    expect(findNameDuplicate(roster('Ariel Smith'), 'Ariella Smith')).toBeNull();
  });

  it('allows siblings sharing a surname and a middle name', () => {
    expect(findNameDuplicate(roster('Ebenyi Excel Munachi'), 'Ebenyi Ebenezer Edidiong')).toBeNull();
  });
});
