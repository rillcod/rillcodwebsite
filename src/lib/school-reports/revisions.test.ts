import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hashReportPayload, publishSchoolReportRevision } from './revisions';

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

  it('publishes through the atomic database RPC with the expected lock', async () => {
    const published = {
      id: 'revision-2',
      report_id: 'report-1',
      revision_number: 2,
      status: 'published',
    };
    const rpc = vi.fn(async () => ({ data: [published], error: null }));
    const result = await publishSchoolReportRevision(
      { rpc } as any,
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Term report',
        lock_version: 7,
        verification_code: null,
        snapshot: { dataSources: [] },
        narrative: { executiveSummary: 'Ready for publication.' },
        design: {},
      } as any,
      '22222222-2222-4222-8222-222222222222',
      { expectedLockVersion: 7 },
    );
    expect(result.revision_number).toBe(2);
    expect(rpc).toHaveBeenCalledWith(
      'publish_school_report_revision_atomic',
      expect.objectContaining({ p_expected_lock_version: 7 }),
    );
  });

  it('maps an atomic publication race to REPORT_CONFLICT', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'REPORT_CONFLICT' } }));
    await expect(
      publishSchoolReportRevision(
        { rpc } as any,
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Term report',
          lock_version: 3,
          snapshot: {},
          narrative: { executiveSummary: 'Ready.' },
          design: {},
        } as any,
        '22222222-2222-4222-8222-222222222222',
        { expectedLockVersion: 3 },
      ),
    ).rejects.toMatchObject({ code: 'REPORT_CONFLICT' });
  });

  it('keeps publication and its audit event in one SQL transaction and guards immutable content', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260929000085_atomic_school_report_publication.sql'),
      'utf8',
    );
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('lock_version = v_report.lock_version + 1');
    expect(migration).toContain('INSERT INTO public.school_report_events');
    expect(migration).toContain('PUBLISHED_REPORT_CONTENT_IS_IMMUTABLE');
  });
});
