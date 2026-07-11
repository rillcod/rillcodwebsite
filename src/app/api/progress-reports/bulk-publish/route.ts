import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { publishProgressReport } from '@/lib/reports/publish-service';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';

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
    const { data: caller } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only admins and teachers can publish reports' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const term = typeof body.term === 'string' && body.term.trim() ? body.term.trim() : null;
    const reportIds = Array.isArray(body.reportIds) ? body.reportIds.filter((value: unknown) => typeof value === 'string') : null;

    let query = admin.from('student_progress_reports').select('*').eq('is_published', false);
    if (caller.role === 'teacher') {
      // Class-owned students, not only reports this teacher authored — so handoffs
      // still get bulk-published after term/class transfer.
      const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
      if (classScope.classIds.length === 0) {
        return NextResponse.json({ published: 0, skipped: 0, failures: [], message: 'No owned classes to publish for.' });
      }
      const { data: students } = await admin
        .from('portal_users')
        .select('id')
        .eq('role', 'student')
        .in('class_id', classScope.classIds);
      const studentIds = (students ?? []).map((s: any) => s.id).filter(Boolean);
      if (studentIds.length === 0) {
        return NextResponse.json({ published: 0, skipped: 0, failures: [], message: 'No students in your classes.' });
      }
      query = query.in('student_id', studentIds);
    }
    if (term) query = query.eq('report_term', term);
    if (reportIds?.length) query = query.in('id', reportIds);
    const { data: drafts, error: findError } = await query;
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
    if (!drafts?.length) return NextResponse.json({ published: 0, skipped: 0, failures: [], message: 'No matching drafts to publish.' });

    const failures: Array<{ id: string; student_name: string | null; issues: string[] }> = [];
    const publishedIds: string[] = [];

    for (const draft of drafts as any[]) {
      // Transfer authorship to current class owner before publish so ownership stays consistent.
      if (caller.role === 'teacher' && draft.teacher_id !== caller.id) {
        await admin.from('student_progress_reports')
          .update({ teacher_id: caller.id, updated_at: new Date().toISOString() })
          .eq('id', draft.id);
      }
      const result = await publishProgressReport(admin, draft.id);
      if (!result.ok) failures.push({ id: draft.id, student_name: draft.student_name ?? null, issues: result.issues ?? [result.error] });
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
