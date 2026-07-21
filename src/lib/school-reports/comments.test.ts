import { describe, expect, it } from 'vitest';
import { addSchoolReportComment, listSchoolReportComments } from './comments';

type Result = { data: any; error: { message: string } | null };

function selectClient(result: Result) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: any = {
    select: (...args: unknown[]) => {
      calls.push(['select', ...args]);
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push(['eq', ...args]);
      return chain;
    },
    order: (...args: unknown[]) => {
      calls.push(['order', ...args]);
      return chain;
    },
    limit: (...args: unknown[]) => {
      calls.push(['limit', ...args]);
      return Promise.resolve(result);
    },
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(['from', table]);
        return chain;
      },
    },
  };
}

function addClient(input: {
  revision?: Result;
  insert?: Result;
}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const revisionChain: any = {
    select: (...args: unknown[]) => {
      calls.push(['revision.select', ...args]);
      return revisionChain;
    },
    eq: (...args: unknown[]) => {
      calls.push(['revision.eq', ...args]);
      return revisionChain;
    },
    maybeSingle: () => Promise.resolve(input.revision ?? { data: null, error: null }),
  };
  const insertChain: any = {
    insert: (value: unknown) => {
      calls.push(['insert', value]);
      return insertChain;
    },
    select: (...args: unknown[]) => {
      calls.push(['insert.select', ...args]);
      return insertChain;
    },
    single: () => Promise.resolve(input.insert ?? { data: null, error: null }),
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(['from', table]);
        return table === 'school_report_revisions' ? revisionChain : insertChain;
      },
    },
  };
}

const row = {
  id: 'comment-1',
  report_id: 'report-1',
  revision_id: 'revision-1',
  author_id: 'teacher-1',
  body: 'Please verify attendance.',
  created_at: '2026-09-21T10:00:00.000Z',
  updated_at: '2026-09-21T10:00:00.000Z',
  portal_users: { full_name: 'Teacher One' },
};

describe('school report comments', () => {
  it('lists comments oldest first and maps the author name', async () => {
    const mock = selectClient({ data: [row], error: null });
    const result = await listSchoolReportComments(mock.client as any, 'report-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'comment-1',
        report_id: 'report-1',
        authorName: 'Teacher One',
      }),
    ]);
    expect(mock.calls).toContainEqual(['eq', 'report_id', 'report-1']);
    expect(mock.calls).toContainEqual(['order', 'created_at', { ascending: true }]);
    expect(mock.calls).toContainEqual(['limit', 200]);
  });

  it('rejects comments shorter than two trimmed characters', async () => {
    const mock = addClient({});
    await expect(
      addSchoolReportComment(mock.client as any, {
        reportId: 'report-1',
        authorId: 'teacher-1',
        body: '  x  ',
      }),
    ).rejects.toThrow('Comment must be at least 2 characters.');
    expect(mock.calls).toEqual([]);
  });

  it('validates that a selected revision belongs to the report', async () => {
    const mock = addClient({ revision: { data: null, error: null } });
    await expect(
      addSchoolReportComment(mock.client as any, {
        reportId: 'report-1',
        revisionId: 'revision-from-another-report',
        authorId: 'teacher-1',
        body: 'Review this.',
      }),
    ).rejects.toThrow('The selected revision does not belong to this report.');
    expect(mock.calls).not.toContainEqual(['from', 'school_report_comments']);
  });

  it('trims and saves an authorized report revision comment', async () => {
    const mock = addClient({
      revision: { data: { id: 'revision-1' }, error: null },
      insert: { data: row, error: null },
    });
    const result = await addSchoolReportComment(mock.client as any, {
      reportId: 'report-1',
      revisionId: 'revision-1',
      authorId: 'teacher-1',
      body: '  Please verify attendance.  ',
    });

    expect(result.authorName).toBe('Teacher One');
    expect(mock.calls).toContainEqual([
      'insert',
      {
        report_id: 'report-1',
        author_id: 'teacher-1',
        revision_id: 'revision-1',
        body: 'Please verify attendance.',
      },
    ]);
  });

  it('surfaces database failures while loading comments', async () => {
    const mock = selectClient({ data: null, error: { message: 'comments unavailable' } });
    await expect(listSchoolReportComments(mock.client as any, 'report-1')).rejects.toThrow(
      'comments unavailable',
    );
  });
});
