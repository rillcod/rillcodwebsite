import { describe, expect, it } from 'vitest';
import { hashReportPayload } from './revisions';

describe('school report revisions', () => {
  it('produces stable sha256 hashes for identical report payloads', () => {
    const payload = {
      snapshot: { generatedAt: '2026-01-01', school: { id: 's1', name: 'Test' } },
      narrative: { executiveSummary: 'Summary text here.' },
      design: { accentColor: '#000000' },
    };
    const a = hashReportPayload(payload as any);
    const b = hashReportPayload(payload as any);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes hash when narrative changes', () => {
    const base = {
      snapshot: { generatedAt: '2026-01-01' },
      narrative: { executiveSummary: 'One' },
      design: null,
    };
    const changed = {
      ...base,
      narrative: { executiveSummary: 'Two' },
    };
    expect(hashReportPayload(base as any)).not.toBe(hashReportPayload(changed as any));
  });
});
