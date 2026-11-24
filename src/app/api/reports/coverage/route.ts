import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { reportCoverageForStudents, currentAcademicPeriod, currentTermLabel } from '@/lib/reports/coverage';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import {
  classifyStudentSessionStatus,
  getSessionBoundary,
  shouldReplaceRosterRow,
} from '@/lib/academic/session-scope';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// GET /api/reports/coverage
// Role-scoped progress-report coverage for THIS term, with the list of students still pending —
// so a school (or teacher/admin) sees the gap and exactly who to attend to, without opening
// every class.  admin → all; teacher → owned classes in assigned schools; school → their school.
export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { isReportIndicatorEnabled } = await import('@/lib/server/app-settings');
    if (!(await isReportIndicatorEnabled(admin))) {
      return NextResponse.json({
        enabled: false,
        termLabel: currentTermLabel(),
        total: 0,
        withReport: 0,
        pending: [],
      });
    }

    let q = admin
      .from('portal_users')
      .select('id, full_name, school_name, class_id, section_class, is_active, created_at, metadata, classes:class_id(name)')
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .limit(5000);

    if (caller.role !== 'admin') {
      const schoolIds: string[] = [];
      if (caller.school_id) schoolIds.push(caller.school_id);
      if (caller.role === 'teacher') {
        const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
        (ts ?? []).forEach((r: any) => {
          if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id);
        });
      }
      if (schoolIds.length === 0) {
        return NextResponse.json({ termLabel: currentTermLabel(), total: 0, withReport: 0, pending: [] });
      }
      q = q.in('school_id', schoolIds) as any;
    }

    if (caller.role === 'teacher') {
      const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
      if (!classScope.classIds.length) {
        return NextResponse.json({ termLabel: currentTermLabel(), total: 0, withReport: 0, pending: [] });
      }
      q = q.in('class_id', classScope.classIds) as any;
    }

    const { data: students, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rawList = students ?? [];
    const academicPeriod = currentAcademicPeriod();
    const boundary = getSessionBoundary(academicPeriod.periodLabel);
    const [{ data: canonicalTerm }, { data: rosterRows }] = await Promise.all([
      admin
        .from('academic_terms')
        .select('id')
        .eq('term_label', academicPeriod.termLabel)
        .eq('academic_year', academicPeriod.periodLabel)
        .maybeSingle(),
      rawList.length > 0
        ? fetchAllSupabaseRows<any>((from, to) =>
            (admin as any)
              .from('class_term_rosters')
              .select('student_id, class_id, status, term_id, started_at, ended_at, reinstated_at')
              .range(from, to),
          )
        : Promise.resolve({ data: [] }),
    ]);

    const classByStudent = new Map(rawList.map((s: any) => [s.id, s.class_id]));
    const rosterByStudent = new Map<string, any>();
    for (const r of (rosterRows ?? []) as any[]) {
      if (!r?.student_id || !classByStudent.has(r.student_id)) continue;
      const existing = rosterByStudent.get(r.student_id);
      const liveCid = classByStudent.get(r.student_id);
      if (shouldReplaceRosterRow(existing, r, liveCid)) {
        rosterByStudent.set(r.student_id, r);
      }
    }

    const list = rawList.filter((s: any) => {
      const ar = rosterByStudent.get(s.id) ?? null;
      const status = classifyStudentSessionStatus(
        { is_active: s.is_active, created_at: s.created_at ?? null, metadata: s.metadata ?? null },
        ar
          ? { status: ar.status, term_id: ar.term_id ?? null, started_at: ar.reinstated_at ?? ar.started_at ?? null }
          : null,
        { canonicalTermId: canonicalTerm?.id ?? null, boundary },
      );
      return status === 'confirmed_current';
    });
    const ids = list.map((s: any) => s.id);
    const { published, drafted } = await reportCoverageForStudents(admin, ids, {
      ...academicPeriod,
      termId: canonicalTerm?.id ?? null,
    });

    const pending = list
      .filter((s: any) => !published.has(s.id))
      .map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        className: s.classes?.name ?? s.section_class ?? null,
        classId: s.class_id ?? null,
        school_name: s.school_name ?? null,
        drafted: drafted.has(s.id),
      }))
      .sort(
        (a: any, b: any) =>
          (a.className ?? '').localeCompare(b.className ?? '') ||
          (a.full_name ?? '').localeCompare(b.full_name ?? ''),
      );

    return NextResponse.json(
      {
        termLabel: academicPeriod.termLabel,
        periodLabel: academicPeriod.periodLabel,
        total: list.length,
        withReport: published.size,
        pendingCount: pending.length,
        pending,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
