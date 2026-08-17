import { describe, expect, it } from 'vitest';

import { liveDocumentOfKind, partnershipNextAction } from './next-action';

const terms = { school_share_percent: 30, settlement_trigger: 'term_end' as const };

describe('partnershipNextAction', () => {
  it('starts with a proposal, not with recording terms', () => {
    const next = partnershipNextAction({ agreed: null, documents: [] });
    expect(next.step).toBe(2);
    expect(next.action?.tab).toBe('compose');
    expect(next.action?.kind).toBe('proposal');
    expect(next.headline.toLowerCase()).toContain('proposal');
  });

  it('treats a draft as unsent, not as delivered', () => {
    const next = partnershipNextAction({
      agreed: null,
      documents: [{ document_kind: 'proposal', status: 'draft', reference: 'RC-PROP-1' }],
    });
    expect(next.tone).toBe('warn');
    expect(next.action?.tab).toBe('archive');
    expect(next.headline).toMatch(/draft/i);
    expect(next.followUp).toBeNull();
  });

  it('does not call a signed proposal a closed deal', () => {
    const next = partnershipNextAction({
      agreed: null,
      documents: [
        {
          document_kind: 'proposal',
          status: 'signed',
          reference: 'RC-PROP-1',
          signed_by_name: 'A Principal',
        },
      ],
    });
    expect(next.tone).not.toBe('done');
    expect(next.hrefs).toBeUndefined();
    expect(next.action?.tab).toBe('terms');
  });

  it('chases a sent proposal that nobody has opened', () => {
    const next = partnershipNextAction({
      agreed: null,
      documents: [{ document_kind: 'proposal', status: 'sent', reference: 'RC-PROP-1', open_count: 0 }],
    });
    expect(next.tone).toBe('wait');
    expect(next.followUp).toBe('proposal');
    expect(next.action?.tab).toBe('archive');
  });

  it('asks for terms once they have read the proposal', () => {
    const next = partnershipNextAction({
      agreed: null,
      documents: [{ document_kind: 'proposal', status: 'sent', open_count: 2 }],
    });
    expect(next.action?.tab).toBe('terms');
    expect(next.step).toBe(3);
  });

  it('issues the MoU after terms and a live proposal, not another quote', () => {
    const next = partnershipNextAction({
      agreed: terms,
      documents: [{ document_kind: 'proposal', status: 'sent', open_count: 1 }],
    });
    expect(next.action).toEqual({ label: 'Issue the MoU', tab: 'compose', kind: 'mou' });
  });

  it('sends a draft MoU before chasing a signature', () => {
    const next = partnershipNextAction({
      agreed: terms,
      documents: [
        { document_kind: 'mou', status: 'draft', reference: 'RC-MOU-1' },
        { document_kind: 'proposal', status: 'sent' },
      ],
    });
    expect(next.action?.label).toMatch(/send this mou/i);
    expect(next.followUp).toBeNull();
  });

  it('only onboard classes after a signed MoU', () => {
    const next = partnershipNextAction({
      agreed: terms,
      documents: [
        { document_kind: 'mou', status: 'signed', reference: 'RC-MOU-1', signed_by_name: 'Mrs Okoro' },
      ],
    });
    expect(next.tone).toBe('done');
    expect(next.hrefs?.map((h) => h.href)).toEqual([
      '/dashboard/classes',
      '/dashboard/school-billing',
    ]);
  });

  it('re-issues a lapsed quote instead of chasing a signature', () => {
    const next = partnershipNextAction({
      agreed: null,
      documents: [
        {
          document_kind: 'proposal',
          status: 'sent',
          valid_until: '2020-01-01',
          reference: 'RC-PROP-OLD',
        },
      ],
    });
    expect(next.action).toEqual({
      label: 'Re-issue the proposal',
      tab: 'compose',
      kind: 'proposal',
    });
    expect(next.followUp).toBeNull();
  });
});

describe('liveDocumentOfKind', () => {
  it('finds a sent quote that still stands', () => {
    expect(
      liveDocumentOfKind(
        [{ document_kind: 'proposal', status: 'sent', valid_until: '2099-01-01', reference: 'A' }],
        'proposal',
      )?.reference,
    ).toBe('A');
  });

  it('ignores a lapsed quote so a re-issue is not treated as a duplicate', () => {
    expect(
      liveDocumentOfKind(
        [{ document_kind: 'proposal', status: 'sent', valid_until: '2020-01-01' }],
        'proposal',
      ),
    ).toBeNull();
  });
});
