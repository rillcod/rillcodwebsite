import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSchoolReportActor: vi.fn(),
  canManageSchoolReport: vi.fn(),
  listSchoolReportComments: vi.fn(),
  addSchoolReportComment: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/school-reports/access', () => ({
  getSchoolReportActor: mocks.getSchoolReportActor,
  canManageSchoolReport: mocks.canManageSchoolReport,
}));

vi.mock('@/lib/school-reports/comments', () => ({
  listSchoolReportComments: mocks.listSchoolReportComments,
  addSchoolReportComment: mocks.addSchoolReportComment,
}));

vi.mock('@/lib/observability/audit-events', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import { GET, POST } from './[id]/comments/route';

const REPORT_ID = '00000000-0000-4000-8000-000000000001';

function actor(role = 'teacher', report: any = {
  id: REPORT_ID,
  school_id: 'school-1',
  working_revision_number: 2,
}) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: report, error: null })),
  };
  return {
    profile: { id: 'teacher-1', role },
    schoolIds: ['school-1'],
    admin: { from: vi.fn(() => query) },
  };
}

const context = { params: Promise.resolve({ id: REPORT_ID }) };

describe('school report comments route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canManageSchoolReport.mockReturnValue(true);
  });

  it('rejects school accounts before querying comments', async () => {
    mocks.getSchoolReportActor.mockResolvedValue(actor('school'));
    const response = await GET(
      new NextRequest(`http://localhost/api/school-performance-reports/${REPORT_ID}/comments`),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.listSchoolReportComments).not.toHaveBeenCalled();
  });

  it('rejects teachers without access to the report school', async () => {
    mocks.getSchoolReportActor.mockResolvedValue(actor());
    mocks.canManageSchoolReport.mockReturnValue(false);
    const response = await GET(
      new NextRequest(`http://localhost/api/school-performance-reports/${REPORT_ID}/comments`),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.listSchoolReportComments).not.toHaveBeenCalled();
  });

  it('returns comments to authorized staff', async () => {
    mocks.getSchoolReportActor.mockResolvedValue(actor());
    mocks.listSchoolReportComments.mockResolvedValue([
      { id: 'comment-1', report_id: REPORT_ID, body: 'Review this.' },
    ]);
    const response = await GET(
      new NextRequest(`http://localhost/api/school-performance-reports/${REPORT_ID}/comments`),
      context,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { comments: [{ id: 'comment-1', report_id: REPORT_ID, body: 'Review this.' }] },
    });
    expect(mocks.listSchoolReportComments).toHaveBeenCalledWith(
      expect.anything(),
      REPORT_ID,
    );
  });

  it('creates a revision-associated comment and records an audit event', async () => {
    mocks.getSchoolReportActor.mockResolvedValue(actor());
    mocks.addSchoolReportComment.mockResolvedValue({
      id: 'comment-1',
      report_id: REPORT_ID,
      revision_id: 'revision-2',
      author_id: 'teacher-1',
      body: 'Review attendance.',
    });
    const request = new NextRequest(
      `http://localhost/api/school-performance-reports/${REPORT_ID}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Review attendance.', revisionId: 'revision-2' }),
      },
    );
    const response = await POST(request, context);

    expect(response.status).toBe(201);
    expect(mocks.addSchoolReportComment).toHaveBeenCalledWith(expect.anything(), {
      reportId: REPORT_ID,
      authorId: 'teacher-1',
      body: 'Review attendance.',
      revisionId: 'revision-2',
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith('report.comment', {
      reportId: REPORT_ID,
      commentId: 'comment-1',
      authorId: 'teacher-1',
      revisionNumber: 2,
    });
  });

  it('returns 400 for malformed JSON without attempting a write', async () => {
    mocks.getSchoolReportActor.mockResolvedValue(actor());
    const request = new NextRequest(
      `http://localhost/api/school-performance-reports/${REPORT_ID}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      },
    );
    const response = await POST(request, context);

    expect(response.status).toBe(400);
    expect(mocks.addSchoolReportComment).not.toHaveBeenCalled();
  });
});
