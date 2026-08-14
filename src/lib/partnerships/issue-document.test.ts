import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateAIContent } = vi.hoisted(() => ({ generateAIContent: vi.fn() }));
vi.mock('@/lib/ai/generate-core', () => ({ generateAIContent }));

import { issuePartnershipDocument } from './issue-document';
import { MissingPartnershipTermsError } from './terms';

const SCHOOL = {
  id: 'school-1',
  name: 'Bay-Flowers International School',
  address: '12 Airport Road',
  city: 'Benin City',
  state: 'Edo',
  student_count: 150,
};

const AGREED = {
  id: 'terms-1',
  school_id: 'school-1',
  billing_model: 'per_student',
  currency: 'NGN',
  billing_cycle: 'term',
  amount_per_student: 30000,
  fixed_package_price: null,
  tiers: null,
  deposit_amount: null,
  rillcod_share_percent: 70,
  school_share_percent: 30,
  status: 'agreed',
};

const PROGRESSION = { id: 'p1', slug: 'k12-ai-coding', title: 'Ladder', subtitle: null, summary: null, edition: 1, status: 'published' };
const LEVELS = [
  {
    year_number: 1, grade: 'Basic 1', theme: 'Digital Discovery',
    terms: [{ term: 1, focus: 'a' }, { term: 2, focus: 'b' }, { term: 3, focus: 'c' }],
    capstone: 'Robot.', portfolio: '3 games.',
  },
];

/**
 * A Supabase stub that answers per table. `updates` records what was written
 * back, which is how we check the document is stored with its reference.
 */
function makeDb(opts: { terms?: Record<string, unknown> | null } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];

  const db = {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => {
          if (table === 'schools') return { data: SCHOOL };
          if (table === 'partnership_terms') return { data: opts.terms ?? null };
          if (table === 'curriculum_progressions') return { data: PROGRESSION };
          return { data: null };
        },
        single: async () => ({ data: { id: 'agr-1', reference: 'RC-MOU-2026-00001' }, error: null }),
        insert: (payload: Record<string, unknown>) => {
          inserted.push(payload);
          return chain;
        },
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
        then: undefined,
      };
      // curriculum levels resolve through the awaited query itself
      if (table === 'curriculum_progression_levels') {
        chain.order = async () => ({ data: LEVELS });
      }
      return chain;
    },
  };
  return { db, updates, inserted };
}

describe('issuing an MoU', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses without agreed terms', async () => {
    const { db } = makeDb({ terms: null });

    // An MoU is the agreement; there is nothing to agree without a rate.
    await expect(
      issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'mou' }),
    ).rejects.toThrow(MissingPartnershipTermsError);
  });

  it('prints the reference the database assigned', async () => {
    const { db, updates } = makeDb({ terms: AGREED });

    const issued = await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'mou' });

    expect(issued.reference).toBe('RC-MOU-2026-00001');
    // The stored document must carry the same number as the row.
    expect(issued.html).toContain('RC-MOU-2026-00001');
    expect(String(updates[0].document_html)).toContain('RC-MOU-2026-00001');
  });

  it('snapshots the terms rather than pointing at them', async () => {
    const { db, inserted } = makeDb({ terms: AGREED });

    await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'mou' });

    const snapshot = inserted[0].terms_snapshot as Record<string, unknown>;
    expect(snapshot.amount_per_student).toBe(30000);
    expect(snapshot.rillcod_share_percent).toBe(70);
    expect(inserted[0].terms_id).toBe('terms-1');
  });

  it('works the split through at the school roll by default', async () => {
    const { db } = makeDb({ terms: AGREED });

    const issued = await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'mou' });

    // 150 students × ₦30,000 = ₦4,500,000; Rillcod 70% = ₦3,150,000.
    expect(issued.html).toContain('At 150 enrolled students');
    expect(issued.html).toContain('₦3,150,000');
  });

  it('never asks the AI engine for contract wording', async () => {
    const { db } = makeDb({ terms: AGREED });

    await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'mou', useAI: true });

    expect(generateAIContent).not.toHaveBeenCalled();
  });
});

describe('issuing a proposal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues without agreed terms and quotes the standard menu', async () => {
    const { db } = makeDb({ terms: null });

    const issued = await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'proposal' });

    expect(issued.termsId).toBeNull();
    expect(issued.html).toContain('Option A');
    expect(issued.narrativeSource).toBe('authored');
  });

  it('states agreed terms once they exist', async () => {
    const { db } = makeDb({ terms: AGREED });

    const issued = await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'proposal' });

    expect(issued.html).toContain('₦30,000 per student per term, shared Rillcod 70% / school 30%');
  });

  it('names the company we actually are', async () => {
    const { db } = makeDb({ terms: null });

    const issued = await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'proposal' });

    // The MoU already asserts this. The proposal was passing a hardcoded
    // "Rillcod Academy" as preparedBy, so it printed a company on its cover
    // that does not exist — on the one page a prospect reads first.
    expect(issued.html).not.toContain('Rillcod Academy');
    expect(issued.html).toContain('Rillcod Technologies');
  });

  it('records that a proposal was issued before terms were agreed', async () => {
    const { db, inserted } = makeDb({ terms: null });

    await issuePartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'proposal' });

    const snapshot = inserted[0].terms_snapshot as Record<string, unknown>;
    expect(String(snapshot.note)).toContain('before terms were agreed');
  });

  it('falls back to authored copy when the model fails, and still issues', async () => {
    generateAIContent.mockRejectedValueOnce(new Error('providers exhausted'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = makeDb({ terms: null });

    const issued = await issuePartnershipDocument({
      db: db as any, schoolId: 'school-1', kind: 'proposal', useAI: true,
    });

    expect(issued.narrativeSource).toBe('authored');
    expect(issued.html).toContain('Option A');
  });
});

describe('a school that is not there', () => {
  it('says so instead of issuing an empty document', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };

    await expect(
      issuePartnershipDocument({ db: db as any, schoolId: 'nope', kind: 'proposal' }),
    ).rejects.toThrow(/does not exist/);
  });
});
