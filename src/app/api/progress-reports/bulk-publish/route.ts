import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST /api/progress-reports/bulk-publish
// Publish many DRAFT reports at once (no per-report preview) — for when there are lots to push out.
// Role-scoped: admin → all drafts; teacher → their OWN authored drafts. Optional { term } and
// { reportIds } narrow it. Returns how many were published.
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
    const reportIds = Array.isArray(body.reportIds) ? body.reportIds.filter((x: any) => typeof x === 'string') : null;

    // Find the matching drafts first (so we can report an accurate count and stay scoped).
    let q = admin.from('student_progress_reports').select('id').eq('is_published', false);
    if (caller.role === 'teacher') q = q.eq('teacher_id', caller.id);   // teachers publish only their own
    if (term) q = q.eq('report_term', term);
    if (reportIds && reportIds.length) q = q.in('id', reportIds);
    const { data: drafts, error: findErr } = await q;
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

    const ids = (drafts ?? []).map((r: any) => r.id);
    if (ids.length === 0) return NextResponse.json({ published: 0, message: 'No matching drafts to publish.' });

    const nowIso = new Date().toISOString();
    let published = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      const { error } = await admin
        .from('student_progress_reports')
        .update({ is_published: true, published_at: nowIso })
        .in('id', batch);
      if (!error) published += batch.length;
    }

    if (published > 0) {
      await logAudit(admin as any, {
        action: 'publish_progress_reports',
        actorId: caller.id,
        resourceType: 'progress_report',
        newValue: `Published ${published} report(s)${term ? ` for ${term}` : ''}`,
        newValues: { published, term },
      });
    }

    return NextResponse.json({ published, term });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
