import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateAIContent } = vi.hoisted(() => ({ generateAIContent: vi.fn() }));
vi.mock('@/lib/ai/generate-core', () => ({ generateAIContent }));

import {
  StaleDocumentError,
  issuePartnershipDocument,
  previewPartnershipDocument,
  refreshPartnershipDocument,
} from './issue-document';
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
function makeDb(
  opts: {
    terms?: Record<string, unknown> | null;
    /** An existing row, for the redraw path to load. */
    agreement?: Record<string, unknown> | null;
  } = {},
) {
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
          if (table === 'partnership_agreements') return { data: opts.agreement ?? null };
          return { data: null };
        },
        // access_code and share_token are column defaults, so a real insert
        // always returns them. A stub that omitted them made the issued
        // document drop panels the preview draws — which is the opposite of
        // what happens in production.
        single: async () => ({
          data: {
            id: 'agr-1',
            reference: 'RC-MOU-2026-00001',
            access_code: '482915',
            share_token: 'tok-parity',
          },
          error: null,
        }),
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

/**
 * Cut one balanced element out of a string of HTML, by the class it opens with.
 *
 * Regex cannot do this: the scan card contains nested divs, so a lazy match stops
 * at the first closing tag and leaves half the block behind. Counting depth is
 * the only honest way to remove it.
 */
function cutBlock(html: string, className: string): string {
  const open = html.indexOf(`<div class="${className}"`);
  if (open < 0) return html;
  let depth = 0;
  let i = open;
  while (i < html.length) {
    if (html.startsWith('<div', i)) {
      depth += 1;
      i += 4;
    } else if (html.startsWith('</div>', i)) {
      depth -= 1;
      i += 6;
      if (depth === 0) return `${html.slice(0, open)}«block»${html.slice(i)}`;
    } else {
      i += 1;
    }
  }
  return html;
}

/**
 * What is left of a document once the two things a preview cannot know are gone:
 * the reference the database assigns on insert, and the scan card that carries
 * the access code and a QR pointing at a row that does not exist yet.
 */
function skeleton(html: string): string {
  let out = html
    .replace(/RC-(?:PROP|MOU)-\d{4}-\d+/g, '«reference»')
    .replace(/(?:Proposal|MoU) — not yet issued/g, '«reference»');
  // Every panel that shows a code or a QR: the proposal's cover and closing
  // cards, and the MoU's running-head and execution cards.
  for (const block of ['cover-scan', 'end-scan', 'online', 'sign-scan']) out = cutBlock(out, block);
  return out;
}

describe('what you previewed is what gets issued', () => {
  beforeEach(() => vi.clearAllMocks());

  /*
    A proposal that looks one way in the preview pane and another way on the
    sheet the school receives makes the preview worthless — you cannot approve
    what you have not seen. Both paths funnel through the same `render`, and
    this is the test that says so out loud, so a future change reachable from
    only one of them fails here instead of in a prospect's inbox.

    Note what this does NOT claim: a document already issued keeps the bytes it
    was issued with, forever. That is deliberate — an issued document is the
    record of what a school was given. Redesigning the template changes the next
    one, never the one already in somebody's hands.
  */
  for (const kind of ['proposal', 'mou'] as const) {
    it(`renders an identical ${kind} either way`, async () => {
      const previewDb = makeDb({ terms: AGREED });
      const issueDb = makeDb({ terms: AGREED });
      const args = { schoolId: 'school-1', kind, illustrativeStudents: 150 };

      const draft = await previewPartnershipDocument({ db: previewDb.db as any, ...args });
      const issued = await issuePartnershipDocument({ db: issueDb.db as any, ...args });

      expect(skeleton(draft.html)).toBe(skeleton(issued.html));
    });
  }

  it('draws the scan card in the preview at the size it will print', async () => {
    const { db } = makeDb({ terms: null });

    const draft = await previewPartnershipDocument({ db: db as any, schoolId: 'school-1', kind: 'proposal' });

    // Omitting the card would make the preview a shorter page than the real
    // one — and on a sheet pinned to A4 with the overflow hidden, a page that
    // fits in preview can spill once the card arrives.
    expect(draft.html).toContain('cover-scan-qr-pending');
    expect(draft.html).toContain('code on issue');
    // Nothing invented: no six digits that lead anywhere.
    expect(draft.accessCode).toBeNull();
    expect(draft.shareToken).toBeNull();
  });
});

describe('redrawing a draft', () => {
  const DRAFT = {
    id: 'agr-1',
    reference: 'RC-PROP-2026-00042',
    status: 'draft',
    document_kind: 'proposal',
    school_id: 'school-1',
    share_token: 'tok-parity',
    access_code: '482915',
  };

  beforeEach(() => vi.clearAllMocks());

  it('keeps the reference, the link and the code', async () => {
    const { db, updates } = makeDb({ terms: AGREED, agreement: DRAFT });

    const redrawn = await refreshPartnershipDocument({ db: db as any, documentId: 'agr-1' });

    // All three may already be written down: the reference on a file, the link
    // in a WhatsApp message, the code read out over the phone. A redraw that
    // changed any of them would strand whoever holds it.
    expect(redrawn.reference).toBe('RC-PROP-2026-00042');
    expect(redrawn.shareToken).toBe('tok-parity');
    expect(redrawn.accessCode).toBe('482915');
    expect(String(updates[0].document_html)).toContain('RC-PROP-2026-00042');
    expect(String(updates[0].document_html)).toContain('482915');
  });

  it('picks up terms agreed since the draft was cut', async () => {
    const { db, updates } = makeDb({ terms: AGREED, agreement: DRAFT });

    await refreshPartnershipDocument({ db: db as any, documentId: 'agr-1' });

    // The row records the terms the document states. Redrawing restates the
    // document, so leaving the old snapshot would make the two disagree.
    expect(String(updates[0].document_html)).toContain('₦30,000 per student per term');
    expect((updates[0].terms_snapshot as Record<string, unknown>).amount_per_student).toBe(30000);
    expect(updates[0].terms_id).toBe('terms-1');
  });

  it('will not rewrite something that has already gone out', async () => {
    const { db, updates } = makeDb({
      terms: AGREED,
      agreement: { ...DRAFT, status: 'sent' },
    });

    await expect(
      refreshPartnershipDocument({ db: db as any, documentId: 'agr-1' }),
    ).rejects.toThrow(StaleDocumentError);
    // And nothing was written on the way to refusing.
    expect(updates).toHaveLength(0);
  });

  it('cannot be talked into changing what kind of document it is', async () => {
    const { db, updates } = makeDb({ terms: AGREED, agreement: DRAFT });

    // The caller has no `kind` to pass — it is read off the row. A reference
    // reads RC-PROP or RC-MOU, so a proposal redrawn as an MoU would file a
    // contract under a number that says it is a quote.
    await refreshPartnershipDocument({
      db: db as any,
      documentId: 'agr-1',
      // @ts-expect-error the type forbids this; the test proves the code does too
      kind: 'mou',
    });

    expect(String(updates[0].document_html)).toContain('Partnership Proposal');
    // The MoU's own title, not the word: a proposal's closing paragraph
    // legitimately says an MoU is what follows agreement.
    expect(String(updates[0].document_html)).not.toContain('<h1>Memorandum of Understanding</h1>');
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
