import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { reportCoverageForStudents, currentAcademicPeriod, currentTermLabel } from '@/lib/reports/coverage';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// GET /api/reports/coverage
// Role-scoped progress-report coverage for THIS term, with the list of students still pending —
// so a school (or teacher/admin) sees the gap and exactly who to attend to, without opening
// every class.  admin → all; teacher → their assigned schools; school → their own school.
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { isReportIndicatorEnabled } = await import('@/lib/server/app-settings');
    if (!(await isReportIndicatorEnabled(admin))) {
      return NextResponse.json({ enabled: false, termLabel: currentTermLabel(), total: 0, withReport: 0, pending: [] });
    }

    let q = admin.from('portal_users')
      .select('id, full_name, school_name, class_id, section_class, classes:class_id(name)')
      .eq('role', 'student').eq('is_active', true);

    if (caller.role !== 'admin') {
      const schoolIds: string[] = [];
      if (caller.school_id) schoolIds.push(caller.school_id);
      if (caller.role === 'teacher') {
        const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
        (ts ?? []).forEach((r: any) => { if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id); });
      }
      if (schoolIds.length === 0) {
        return NextResponse.json({ termLabel: currentTermLabel(), total: 0, withReport: 0, pending: [] });
      }
      q = q.in('school_id', schoolIds) as any;
    }

    const { data: students, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = students ?? [];
    const ids = list.map((s: any) => s.id);
    const academicPeriod = currentAcademicPeriod();
    const { published, drafted } = await reportCoverageForStudents(admin, ids, academicPeriod);

    const pending = list
      .filter((s: any) => !published.has(s.id))
      .map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        className: s.classes?.name ?? s.section_class ?? null,
        school_name: s.school_name ?? null,
        drafted: drafted.has(s.id),
      }))
      .sort((a: any, b: any) => (a.className ?? '').localeCompare(b.className ?? '') || (a.full_name ?? '').localeCompare(b.full_name ?? ''));

    return NextResponse.json({
      termLabel: academicPeriod.termLabel,
      periodLabel: academicPeriod.periodLabel,
      total: list.length,
      withReport: published.size,
      pendingCount: pending.length,
      pending,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
