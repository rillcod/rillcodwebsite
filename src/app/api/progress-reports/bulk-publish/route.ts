import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateProgressReportVerificationCode, progressReportPublishIssues } from '@/lib/reports/publication';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only admins and teachers can publish reports' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const term = typeof body.term === 'string' && body.term.trim() ? body.term.trim() : null;
    const reportIds = Array.isArray(body.reportIds) ? body.reportIds.filter((value: unknown) => typeof value === 'string') : null;

    let query = admin.from('student_progress_reports').select('*').eq('is_published', false);
    if (caller.role === 'teacher') query = query.eq('teacher_id', caller.id);
    if (term) query = query.eq('report_term', term);
    if (reportIds?.length) query = query.in('id', reportIds);
    const { data: drafts, error: findError } = await query;
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!drafts?.length) return NextResponse.json({ published: 0, skipped: 0, failures: [], message: 'No matching drafts to publish.' });

    const failures: Array<{ id: string; student_name: string | null; issues: string[] }> = [];
    const publishedIds: string[] = [];
    const now = new Date().toISOString();

    for (const draft of drafts as any[]) {
      const issues = progressReportPublishIssues(draft as Record<string, unknown>);
      if (issues.length) {
        failures.push({ id: draft.id, student_name: draft.student_name ?? null, issues });
        continue;
      }
      const verificationCode = draft.verification_code || await generateProgressReportVerificationCode(admin);
      const { error } = await admin.from('student_progress_reports').update({
        is_published: true,
        published_at: now,
        verification_code: verificationCode,
        updated_at: now,
      }).eq('id', draft.id).eq('is_published', false);
      if (error) failures.push({ id: draft.id, student_name: draft.student_name ?? null, issues: [error.message] });
      else publishedIds.push(draft.id);
    }

    if (publishedIds.length) {
      await logAudit(admin as any, {
        action: 'publish_progress_reports', actorId: caller.id, resourceType: 'progress_report',
        newValue: `Published ${publishedIds.length} report(s)${term ? ` for ${term}` : ''}`,
        newValues: { published: publishedIds.length, skipped: failures.length, term, reportIds: publishedIds },
      });
    }

    return NextResponse.json({
      published: publishedIds.length,
      skipped: failures.length,
      failures,
      term,
      message: failures.length ? `${publishedIds.length} published; ${failures.length} skipped because they are incomplete or failed validation.` : `${publishedIds.length} report(s) published.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
  }
}