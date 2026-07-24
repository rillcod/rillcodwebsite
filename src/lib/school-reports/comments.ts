import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any>;

export type SchoolReportCommentRow = {
  id: string;
  report_id: string;
  revision_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type SchoolReportCommentView = SchoolReportCommentRow & {
  authorName: string | null;
};

export async function listSchoolReportComments(
  admin: AnyClient,
  reportId: string,
): Promise<SchoolReportCommentView[]> {
  const { data, error } = await admin
    .from('school_report_comments')
    .select('id,report_id,revision_id,author_id,body,created_at,updated_at,portal_users!school_report_comments_author_id_fkey(full_name)')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    report_id: row.report_id,
    revision_id: row.revision_id,
    author_id: row.author_id,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    authorName: row.portal_users?.full_name ?? null,
  }));
}

export async function addSchoolReportComment(
  admin: AnyClient,
  input: {
    reportId: string;
    authorId: string;
    body: string;
    revisionId?: string | null;
  },
): Promise<SchoolReportCommentView> {
  const body = String(input.body || '').trim();
  if (body.length < 2) throw new Error('Comment must be at least 2 characters.');

  if (input.revisionId) {
    const { data: revision, error: revisionError } = await admin
      .from('school_report_revisions')
      .select('id')
      .eq('id', input.revisionId)
      .eq('report_id', input.reportId)
      .maybeSingle();

    if (revisionError) throw new Error(revisionError.message);
    if (!revision) {
      throw new Error('The selected revision does not belong to this report.');
    }
  }

  const { data, error } = await admin
    .from('school_report_comments')
    .insert({
      report_id: input.reportId,
      author_id: input.authorId,
      revision_id: input.revisionId ?? null,
      body,
    })
    .select('id,report_id,revision_id,author_id,body,created_at,updated_at,portal_users!school_report_comments_author_id_fkey(full_name)')
    .single();

  if (error || !data) throw new Error(error?.message || 'Unable to save comment.');

  return {
    id: data.id,
    report_id: data.report_id,
    revision_id: data.revision_id,
    author_id: data.author_id,
    body: data.body,
    created_at: data.created_at,
    updated_at: data.updated_at,
    authorName: (data as any).portal_users?.full_name ?? null,
  };
}
