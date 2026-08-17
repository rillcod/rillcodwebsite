import { describe, expect, it } from 'vitest';

import { pipelineAttention, pipelineOutcomes } from './pipeline';

const NOW = new Date('2026-08-17T12:00:00Z');

function row(partial: Record<string, unknown>) {
  return {
    school_id: 's1',
    document_kind: 'proposal',
    status: 'sent',
    created_at: '2026-08-01T00:00:00Z',
    sent_at: '2026-08-01T00:00:00Z',
    signed_at: null,
    valid_until: null,
    open_count: 0,
    ...partial,
  };
}

describe('pipelineAttention', () => {
  it('flags a draft the day it is issued', () => {
    const flag = pipelineAttention(
      row({ status: 'draft', created_at: '2026-08-17T09:00:00Z', sent_at: null }),
      NOW,
    );
    expect(flag.needs).toBe(true);
    expect(flag.reason).toMatch(/cannot open/i);
    expect(flag.tab).toBe('document');
  });

  it('sends a lapsed quote back to compose, not to chase a signature', () => {
    const flag = pipelineAttention(row({ valid_until: '2026-08-01' }), NOW);
    expect(flag.needs).toBe(true);
    expect(flag.tab).toBe('compose');
    expect(flag.reason).toMatch(/lapsed/i);
  });

  it('does not ask a proposal for a signature', () => {
    const flag = pipelineAttention(row({ open_count: 4 }), NOW);
    expect(flag.reason).toMatch(/answer/i);
    expect(flag.reason).not.toMatch(/signature/i);
  });

  it('does ask an MoU for a signature', () => {
    const flag = pipelineAttention(row({ document_kind: 'mou', open_count: 4 }), NOW);
    expect(flag.reason).toMatch(/signature/i);
  });
});

describe('pipelineOutcomes', () => {
  it('counts conversion as schools who signed an MoU, not signed rows over proposals', () => {
    const out = pipelineOutcomes([
      row({ school_id: 'a', document_kind: 'proposal', status: 'sent' }),
      row({ school_id: 'b', document_kind: 'proposal', status: 'sent' }),
      row({
        school_id: 'a',
        document_kind: 'mou',
        status: 'signed',
        signed_at: '2026-08-10T00:00:00Z',
        sent_at: '2026-08-09T00:00:00Z',
      }),
    ]);
    // Two schools were sent a proposal; one signed an MoU.
    expect(out.signedRate).toBe(50);
    expect(out.signed).toBe(1);
  });

  it('does not treat a signed MoU as a signed proposal', () => {
    const out = pipelineOutcomes([
      row({ school_id: 'a', document_kind: 'proposal', status: 'sent' }),
      row({ school_id: 'a', document_kind: 'mou', status: 'signed', signed_at: '2026-08-10T00:00:00Z' }),
    ]);
    expect(out.signed).toBe(1);
    expect(out.sent).toBe(1);
    expect(out.signedRate).toBe(100);
  });

  it('measures time to sign from the first proposal, not from sending the MoU', () => {
    const out = pipelineOutcomes([
      row({
        school_id: 'a',
        document_kind: 'proposal',
        status: 'sent',
        sent_at: '2026-08-01T00:00:00Z',
      }),
      row({
        school_id: 'a',
        document_kind: 'mou',
        status: 'signed',
        sent_at: '2026-08-10T00:00:00Z',
        signed_at: '2026-08-11T00:00:00Z',
      }),
    ]);
    expect(out.medianDaysToSign).toBe(10);
  });
});
