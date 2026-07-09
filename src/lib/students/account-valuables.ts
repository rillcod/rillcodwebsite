import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

export type AccountValuables = {
  cardIssued: boolean;
  cardCount: number;
  publishedReportCount: number;
  publishedReports: Array<{ term: string | null; year: string | null; course: string | null }>;
  hasValuables: boolean;
  /** Human summary for a confirm dialog / error message. */
  summary: string;
};

/**
 * What would be LOST if this account is hard-deleted — an issued ID card (real money) and any
 * PUBLISHED progress reports (with their term + year). Used to warn before total deletion so a
 * same-name mix-up can't quietly destroy a paid card or a published report.
 */
export async function getAccountValuables(
  admin: AnySupabase,
  portalUserId: string,
  studentRowId?: string | null,
): Promise<AccountValuables> {
  const holderIds = [portalUserId, studentRowId].filter(Boolean) as string[];
  const [{ data: cards }, { data: reports }] = await Promise.all([
    admin.from('identity_cards').select('id, status').in('holder_id', holderIds),
    admin.from('student_progress_reports')
      .select('report_term, report_period, course_name, is_published')
      .eq('student_id', portalUserId)
      .eq('is_published', true),
  ]);

  const cardCount = (cards ?? []).length;
  const published = (reports ?? []) as any[];
  const publishedReports = published.map((r) => ({
    term: r.report_term ?? null,
    year: r.report_period ?? null,
    course: r.course_name ?? null,
  }));

  const cardIssued = cardCount > 0;
  const publishedReportCount = published.length;
  const hasValuables = cardIssued || publishedReportCount > 0;

  const parts: string[] = [];
  if (cardIssued) parts.push(`${cardCount} issued ID card${cardCount > 1 ? 's' : ''} (already paid for/printed)`);
  if (publishedReportCount > 0) {
    const terms = publishedReports
      .map((r) => [r.term, r.year].filter(Boolean).join(' '))
      .filter(Boolean);
    const uniq = Array.from(new Set(terms));
    parts.push(`${publishedReportCount} PUBLISHED progress report${publishedReportCount > 1 ? 's' : ''}${uniq.length ? ` (${uniq.join(', ')})` : ''}`);
  }
  const summary = parts.length ? `This account has ${parts.join(' and ')}.` : '';

  return { cardIssued, cardCount, publishedReportCount, publishedReports, hasValuables, summary };
}
