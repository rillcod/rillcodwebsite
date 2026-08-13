import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queueNotification, enqueueWhatsApp, getParents, recordDeadLetter } = vi.hoisted(() => ({
  queueNotification: vi.fn(),
  enqueueWhatsApp: vi.fn(),
  getParents: vi.fn(),
  recordDeadLetter: vi.fn(),
}));

vi.mock('@/services/queue.service', () => ({ queueService: { queueNotification } }));
vi.mock('@/lib/whatsapp/send', () => ({ enqueueWhatsApp }));
vi.mock('@/lib/parents/links', () => ({ getParentsForStudentPortalId: getParents }));
vi.mock('@/lib/operations/dead-letter', () => ({ recordDeadLetter }));
vi.mock('@/lib/email/rillcod-transactional-email', () => ({
  buildReportEmail: () => '<p>report</p>',
  isInAppEmail: (email: string) => email.endsWith('@rillcod.com'),
}));
vi.mock('@/lib/email/email-tracking-token', () => ({ buildEmailTrackingPixelUrl: () => 'https://rillcod.com/pixel' }));

import { queueProgressReportPublicationDelivery } from './publication-delivery';

function queryResult(data: any, error: any = null) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error }),
  };
  return chain;
}

describe('queueProgressReportPublicationDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueNotification.mockResolvedValue('job-1');
    enqueueWhatsApp.mockResolvedValue({ id: 'wa-1', queued: true });
    recordDeadLetter.mockResolvedValue('dead-1');
    getParents.mockResolvedValue([]);
  });

  it('uses durable email and WhatsApp queues and creates the in-app alert', async () => {
    const notificationInserts: any[] = [];
    const admin = {
      from: (table: string) => {
        if (table === 'portal_users') return queryResult({ id: 'student-1', email: 'student@example.com', full_name: 'Ada', school_id: 'school-1' });
        if (table === 'students') return queryResult({ parent_email: 'parent@example.com', parent_name: 'Parent', parent_phone: '08012345678' });
        if (table === 'notifications') return { insert: async (row: any) => { notificationInserts.push(row); return { error: null }; } };
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await queueProgressReportPublicationDelivery(admin, {
      id: 'report-1', student_id: 'student-1', report_term: 'First Term', report_period: '2026/2027',
      verification_code: 'RPT-ONE', overall_grade: 'A1', school_id: 'school-1',
    }, 'teacher-1');

    expect(result).toMatchObject({ status: 'queued', emailQueued: 2, whatsappQueued: 1, inAppCreated: 1, failures: [] });
    expect(queueNotification).toHaveBeenCalledTimes(2);
    expect(queueNotification.mock.calls[1][2]).toMatchObject({ external: true, eventType: 'progress_report_published' });
    expect(enqueueWhatsApp).toHaveBeenCalledWith(admin, expect.objectContaining({
      sourceType: 'progress_report_published',
      sourceId: 'report-1',
      idempotencyKey: 'progress-report:report-1:08012345678',
    }));
    expect(notificationInserts).toHaveLength(1);
  });

  it('preserves setup failures in the recovery queue instead of reporting delivery success', async () => {
    const admin = {
      from: (table: string) => table === 'portal_users'
        ? queryResult(null, { message: 'database unavailable' })
        : queryResult(null),
    };

    const result = await queueProgressReportPublicationDelivery(admin, {
      id: 'report-2', student_id: 'student-2', report_term: 'Second Term',
    }, 'teacher-1');

    expect(result.status).toBe('recovery_required');
    expect(recordDeadLetter).toHaveBeenCalledWith(expect.objectContaining({
      source: 'progress_report_publication_delivery',
      originalJobId: 'progress-report:report-2',
    }));
  });
});
