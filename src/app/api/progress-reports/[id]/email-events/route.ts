import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

async function teacherSchoolIds(teacherId: string, fallbackSchoolId?: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const { data } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    if (row.school_id) ids.add(row.school_id);
  }
  return ids;
}

// GET /api/progress-reports/[id]/email-events
// Returns all email_events rows for a report, newest first.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const db = adminClient();

  // Fetch the report + its metadata (email_sent_at / email_sent_to)
  const [reportRes, eventsRes] = await Promise.all([
    db.from('student_progress_reports')
      .select('id, student_name, report_term, overall_grade, is_published, updated_at, teacher_id, school_id, student_id')
      .eq('id', id)
      .maybeSingle(),
    db.from('email_events')
      .select('id, event, email, occurred_at')
      .eq('report_id', id)
      .order('occurred_at', { ascending: false }),
  ]);

  if (!reportRes.data) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const report = reportRes.data;

  if (caller.role === 'school') {
    if (!caller.school_id || report.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (caller.role === 'teacher') {
    const schoolIds = await teacherSchoolIds(caller.id, caller.school_id);
    const ownsReport = report.teacher_id === caller.id;
    const scopedToReportSchool = !!report.school_id && schoolIds.has(report.school_id);
    if (!ownsReport && !scopedToReportSchool) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json({
    report,
    events: eventsRes.data ?? [],
  });
}
