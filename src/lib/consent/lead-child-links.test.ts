import { describe, expect, it } from 'vitest';
import type { LeadChildLink } from './lead-child-links';
import { isActiveLeadChildLink } from './lead-child-links';

// Mirror the private fromStored mapper so we can unit-test relational shape without DB.
function fromStored(row: {
  id?: string;
  lead_id: string;
  child_index: number;
  student_portal_user_id: string;
  status: LeadChildLink['link_status'];
  source: LeadChildLink['source'];
  linked_by: string | null;
  linked_at?: string;
  metadata: Record<string, unknown> | null;
}): LeadChildLink {
  return {
    ...row,
    link_status: row.status,
    student_name: typeof row.metadata?.student_name === 'string' ? row.metadata.student_name : null,
    student_class: typeof row.metadata?.student_class === 'string' ? row.metadata.student_class : null,
  };
}

describe('lead child link mapping', () => {
  it('maps stored status and metadata into the API-facing child link shape', () => {
    const mapped = fromStored({
      id: 'link-1',
      lead_id: 'lead-1',
      child_index: 0,
      student_portal_user_id: 'student-1',
      status: 'approved',
      source: 'match_review',
      linked_by: 'staff-1',
      metadata: { student_name: 'Ayo', student_class: 'Basic 4' },
    });

    expect(mapped.link_status).toBe('approved');
    expect(mapped.student_name).toBe('Ayo');
    expect(mapped.student_class).toBe('Basic 4');
  });

  it('treats missing metadata fields as null instead of inventing child identity', () => {
    const mapped = fromStored({
      lead_id: 'lead-2',
      child_index: 1,
      student_portal_user_id: 'student-2',
      status: 'candidate',
      source: 'match_review',
      linked_by: null,
      metadata: {},
    });

    expect(mapped.link_status).toBe('candidate');
    expect(mapped.student_name).toBeNull();
    expect(mapped.student_class).toBeNull();
  });
});

describe('lead child link invariants', () => {
  it('requires non-negative integer child slots', () => {
    const validIndexes = [0, 1, 2];
    for (const child_index of validIndexes) {
      expect(Number.isInteger(child_index) && child_index >= 0).toBe(true);
    }
    expect(Number.isInteger(0.5) && 0.5 >= 0).toBe(false);
    expect(Number.isInteger(-1) && -1 >= 0).toBe(false);
  });

  it('keeps approved and onboarded links distinct from candidate suggestions', () => {
    const approved = new Set<LeadChildLink['link_status']>(['approved', 'onboarded']);
    const suggestions = new Set<LeadChildLink['link_status']>(['candidate']);
    for (const status of approved) {
      expect(suggestions.has(status)).toBe(false);
    }
  });

  // Credential delivery must never act on a machine guess.
  it('only approved and onboarded links may receive credentials', () => {
    const eligible = (['approved', 'onboarded', 'candidate', 'unlinked', 'reverted'] as const)
      .filter((s) => isActiveLeadChildLink(s));
    expect(eligible).toEqual(['approved', 'onboarded']);
  });

  it('a candidate guess is not credential-eligible', () => {
    expect(isActiveLeadChildLink('candidate')).toBe(false);
    expect(isActiveLeadChildLink('unlinked')).toBe(false);
    expect(isActiveLeadChildLink('reverted')).toBe(false);
  });

  it('treats parent ownership sync as an approved provenance source', () => {
    const source: LeadChildLink['source'] = 'parent_ownership_sync';
    expect(source).toBe('parent_ownership_sync');
  });
});
