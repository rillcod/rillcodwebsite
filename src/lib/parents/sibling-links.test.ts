import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Policy tests for sibling reconciliation.
 *
 * The case these encode: a parent onboarded from a consent form that named ONE
 * child ended up owning only that child, while their other child at the same
 * school stayed unlinked — so the sibling's report sat behind "parent setup
 * required" and staff had to link them by hand.
 *
 * The load-bearing distinction is which evidence may link automatically:
 *   • the student record itself names the parent (email/phone) → link
 *   • only the family name matches                             → SUGGEST, never link
 */

const links: Array<{ parent_id: string; student_id: string }> = [];

vi.mock('@/lib/parents/links', () => ({
  getExistingParentLink: vi.fn(async (_admin: unknown, studentId: string) => {
    const found = links.find((l) => l.student_id === studentId);
    return found ? { parentId: found.parent_id } : null;
  }),
  isParentLinkConflict: (e: unknown) => (e as { code?: string })?.code === 'STUDENT_ALREADY_LINKED',
  syncExplicitParentStudentLink: vi.fn(async (_admin: unknown, parentId: string, studentId: string) => {
    const other = links.find((l) => l.student_id === studentId && l.parent_id !== parentId);
    if (other) throw Object.assign(new Error('already linked'), { code: 'STUDENT_ALREADY_LINKED' });
    if (!links.some((l) => l.student_id === studentId && l.parent_id === parentId)) {
      links.push({ parent_id: parentId, student_id: studentId });
    }
  }),
}));

import { linkParentSiblings } from './sibling-links';

const SCHOOL = 'school-1';
const OTHER_SCHOOL = 'school-2';
const PARENT = 'parent-1';

type Row = Record<string, any>;

function admin(students: Row[], parent: Row) {
  const tables: Record<string, Row[]> = {
    portal_users: [parent],
    students,
    parent_student_links: links,
  };

  function from(table: string) {
    const filters: Array<{ col: string; op: string; val: any }> = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => {
      const v = r[f.col];
      if (f.op === 'eq') return v === f.val;
      if (f.op === 'neq') return v !== f.val;
      if (f.op === 'ilike') return String(v ?? '').toLowerCase() === String(f.val ?? '').toLowerCase();
      return true;
    }));
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { filters.push({ col, op: 'eq', val }); return api; },
      neq: (col: string, val: any) => { filters.push({ col, op: 'neq', val }); return api; },
      ilike: (col: string, val: any) => { filters.push({ col, op: 'ilike', val }); return api; },
      limit: () => api,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: rows(), error: null }),
    };
    return api;
  }
  return { from } as any;
}

const parentRow = {
  id: PARENT,
  email: 'carol@example.com',
  phone: '+2347041232094',
  full_name: 'Caroline .A. Ihueghian',
  role: 'parent',
  school_id: SCHOOL,
};

beforeEach(() => { links.length = 0; });

describe('linkParentSiblings', () => {
  it('links a sibling whose own record names the parent', async () => {
    const db = admin([
      { id: 's-1', user_id: 'pu-1', full_name: 'Emmanuella Ihueghian', school_id: SCHOOL, parent_email: 'carol@example.com', parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked.map((c) => c.fullName)).toEqual(['Emmanuella Ihueghian']);
    expect(links).toHaveLength(1);
  });

  it('tolerates phone format variants within the school', async () => {
    const db = admin([
      { id: 's-1', user_id: 'pu-1', full_name: 'Emmanuella', school_id: SCHOOL, parent_email: null, parent_phone: '07041232094' },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked.map((c) => c.matchedOn)).toEqual(['phone']);
  });

  // The Gabriel case: no contact on file, only the family name matches.
  it('SUGGESTS a same-school surname match but never links it', async () => {
    const db = admin([
      { id: 's-2', user_id: 'pu-2', full_name: 'Gabriel Ihuaghian', school_id: SCHOOL, parent_email: null, parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked).toEqual([]);
    expect(links).toHaveLength(0);
    expect(r.suggested).toHaveLength(1);
    expect(r.suggested[0]).toMatchObject({
      fullName: 'Gabriel Ihuaghian',
      matchedOn: 'surname',
      reason: 'surname_only',
    });
  });

  // Precision guards. These are all real false positives the loose claim-guard
  // matcher produced against the live roster; a noisy list is a list staff stop reading.
  it.each([
    ['Sidick Angel', 'Angela Ofure Imokhai'],        // Angela/Angel — 1 typo, too short
    ['Victorious Evbuomwan', 'Azugo Victor Ese'],    // substring
    ['Idemudia victory', 'Azugo Victor Ese'],        // 2 typos
    ['Kiki Temi Tope', 'Oziegbe Hope'],              // Hope/Tope — 1 typo, too short
    ['Itohosa Osato Emokpae', 'Iyobosa Otakhoigbogie'], // 2 typos
  ])('does not suggest %s for parent %s', async (studentName, parentName) => {
    const db = admin([
      { id: 's-x', user_id: 'pu-x', full_name: studentName, school_id: SCHOOL, parent_email: null, parent_phone: null },
    ], { ...parentRow, full_name: parentName });

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.suggested).toEqual([]);
  });

  it.each([
    ['Gabriel Ihuaghian', 'Caroline .A. Ihueghian', 'ihueghian'], // 1 typo, both long
    ['Rushdiya Alasa', 'MR & MRS ARUNA ALASA', 'alasa'],          // exact, title stripped
    ['Blossom Idor', 'AUSTIN IDOR', 'idor'],                      // exact, 4 chars
    ['Nancy Ogbebor', 'Jennifer  ogbebor', 'ogbebor'],            // exact
  ])('still suggests %s for parent %s', async (studentName, parentName, token) => {
    const db = admin([
      { id: 's-y', user_id: 'pu-y', full_name: studentName, school_id: SCHOOL, parent_email: null, parent_phone: null },
    ], { ...parentRow, full_name: parentName });

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.suggested).toHaveLength(1);
    expect(r.suggested[0].matchedToken).toBe(token);
    expect(r.linked).toEqual([]);
  });

  it('never matches on a title alone', async () => {
    const db = admin([
      { id: 's-z', user_id: 'pu-z', full_name: 'Mrs Somebody Else', school_id: SCHOOL, parent_email: null, parent_phone: null },
    ], { ...parentRow, full_name: 'MRS Adaeze Nwosu' });

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.suggested).toEqual([]);
  });

  it('does not suggest a surname match from a different school', async () => {
    const db = admin([
      { id: 's-3', user_id: 'pu-3', full_name: 'Grace Ihueghian', school_id: OTHER_SCHOOL, parent_email: null, parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked).toEqual([]);
    expect(r.suggested).toEqual([]);
  });

  it('never steals a student already owned by another parent', async () => {
    links.push({ parent_id: 'parent-2', student_id: 's-4' });
    const db = admin([
      { id: 's-4', user_id: 'pu-4', full_name: 'Owned Child', school_id: SCHOOL, parent_email: 'carol@example.com', parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked).toEqual([]);
    expect(r.skipped[0]).toMatchObject({ fullName: 'Owned Child', reason: 'owned_by_other_parent' });
    expect(links).toEqual([{ parent_id: 'parent-2', student_id: 's-4' }]);
  });

  it('surname matches already owned by another parent are not suggested', async () => {
    links.push({ parent_id: 'parent-2', student_id: 's-5' });
    const db = admin([
      { id: 's-5', user_id: 'pu-5', full_name: 'Gabriel Ihuaghian', school_id: SCHOOL, parent_email: null, parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.suggested).toEqual([]);
  });

  it('dryRun reports without writing', async () => {
    const db = admin([
      { id: 's-1', user_id: 'pu-1', full_name: 'Emmanuella', school_id: SCHOOL, parent_email: 'carol@example.com', parent_phone: null },
    ], parentRow);

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test', dryRun: true });

    expect(r.wouldLink.map((c) => c.fullName)).toEqual(['Emmanuella']);
    expect(r.linked).toEqual([]);
    expect(links).toHaveLength(0);
  });

  it('ignores non-parent accounts', async () => {
    const db = admin([
      { id: 's-1', user_id: 'pu-1', full_name: 'Emmanuella', school_id: SCHOOL, parent_email: 'carol@example.com', parent_phone: null },
    ], { ...parentRow, role: 'teacher' });

    const r = await linkParentSiblings(db, { parentId: PARENT, source: 'test' });

    expect(r.linked).toEqual([]);
    expect(links).toHaveLength(0);
  });
});
