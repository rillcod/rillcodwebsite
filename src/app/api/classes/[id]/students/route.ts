import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { reportCoverageForStudents, currentAcademicPeriod } from '@/lib/reports/coverage';
import { formatAcademicSession } from '@/lib/reports/academic-period';
import { isReportIndicatorEnabled, isPasteClaimEnabled } from '@/lib/server/app-settings';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/classes/[id]/students
// Returns all students enrolled in this class, with school-boundary enforcement
// and safe auto-heal for stale/missing class_id assignments.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await context.params;
    // Light mode (?light=1) skips the report-coverage/indicator enrichment — used by the
    // Transfer screen, which only needs id/name/section, so roster loads are noticeably faster.
    const light = new URL(_request.url).searchParams.get('light') === '1';
    const admin = adminClient();
    const serverSupabase = await createServerClient();

    // ── Auth ────────────────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await serverSupabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ── Fetch class ──────────────────────────────────────────────────────────
    const { data: cls, error: clsErr } = await admin
      .from('classes')
      .select('name, max_students, current_students, program_id, school_id, term_id')
      .eq('id', classId)
      .single();

    if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // ── School/class access guard ────────────────────────────────────────────
    // school role: must match class's school
    if (caller.role === 'school' && cls.school_id && caller.school_id !== cls.school_id) {
      return NextResponse.json({ error: 'Access denied: class is outside your school scope' }, { status: 403 });
    }
    // teacher role: must be assigned to the class's school
    if (caller.role === 'teacher' && cls.school_id) {
      const { data: ts } = await admin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id)
        .eq('school_id', cls.school_id)
        .maybeSingle();
      const primaryMatch = caller.school_id === cls.school_id;
      if (!primaryMatch && !ts) {
        return NextResponse.json({ error: 'Access denied: you are not assigned to this class\'s school' }, { status: 403 });
      }
    }

    // ── Primary: students directly assigned via class_id FK ─────────────────
    const { data: directStudents, error: directErr } = await admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
      .eq('class_id', classId)
      .eq('role', 'student')
      .order('full_name');

    if (directErr) return NextResponse.json({ error: directErr.message }, { status: 500 });

    const knownIds = new Set((directStudents ?? []).map((s: any) => s.id));

    // Students deliberately WITHDRAWN from this class must never be silently re-added by the
    // name-match heal below — otherwise a teacher who removed a name sees it reappear.
    const withdrawnFromThisClass = new Set<string>();
    {
      let wq = (admin as any)
        .from('class_term_rosters')
        .select('student_id, status')
        .eq('class_id', classId)
        .neq('status', 'active');
      wq = cls.term_id ? wq.eq('term_id', cls.term_id) : wq.is('term_id', null);
      const { data: wRows } = await wq;
      (wRows ?? []).forEach((r: any) => r.student_id && withdrawnFromThisClass.add(r.student_id));
    }

    // ── Section-name fallback: students at same school whose section_class text ─
    // matches the class name but class_id was never set (legacy bulk registration)
    let sectionStudents: any[] = [];
    if (cls.school_id && cls.name) {
      const { data: bySection } = await admin
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
        .eq('school_id', cls.school_id)   // hard school boundary
        .eq('section_class', cls.name)
        .is('class_id', null)             // only heal those with no class_id set
        .eq('role', 'student')
        .order('full_name');

      // Skip anyone already known AND anyone previously withdrawn from this class.
      sectionStudents = (bySection ?? []).filter((s: any) => !knownIds.has(s.id) && !withdrawnFromThisClass.has(s.id));

      if (sectionStudents.length > 0) {
        const sectionIds = sectionStudents.map((s: any) => s.id);
        await admin
          .from('portal_users')
          .update({ class_id: classId })
          .in('id', sectionIds)
          .eq('role', 'student');
        sectionStudents = sectionStudents.map((s: any) => ({ ...s, class_id: classId }));
        console.log(`[students API] class="${cls.name}" (${classId}) auto-healed ${sectionIds.length} section_class-matched student(s)`);
      }
    }

    let students = [...(directStudents ?? []), ...sectionStudents];

    // Recovery: if this teacher has already entered progress reports for this
    // class, keep those students visible on the roster even if their class_id
    // drifted. This preserves the intentional teacher-owned class boundary.
    if (caller.role === 'teacher') {
      const knownStudentIds = new Set(students.map((s: any) => s.id));
      let reportQuery = admin
        .from('student_progress_reports')
        .select('student_id')
        .eq('teacher_id', caller.id)
        .eq('section_class', cls.name)
        .not('student_id', 'is', null);
      if (cls.school_id) reportQuery = reportQuery.eq('school_id', cls.school_id);
      const { data: reportRows } = await reportQuery;
      const reportStudentIds = (reportRows ?? [])
        .map((r: any) => r.student_id)
        // Never let report-recovery resurrect a student who was withdrawn from this class.
        .filter((sid: any) => sid && !knownStudentIds.has(sid) && !withdrawnFromThisClass.has(sid));

      if (reportStudentIds.length > 0) {
        const { data: reportLinkedStudents } = await admin
          .from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
          .in('id', reportStudentIds)
          .eq('role', 'student')
          .order('full_name');
        students.push(...(reportLinkedStudents ?? []));
      }
    }

    let formerStudents: any[] = [];
    try {
      let rosterQuery = (admin as any)
        .from('class_term_rosters')
        .select('id, student_id, status, started_at, ended_at, reinstated_at, term_id')
        .eq('class_id', classId);
      rosterQuery = cls.term_id ? rosterQuery.eq('term_id', cls.term_id) : rosterQuery.is('term_id', null);
      const { data: rosterRows, error: rosterErr } = await rosterQuery;
      if (!rosterErr && Array.isArray(rosterRows)) {
        const rosterByStudent = new Map(rosterRows.map((row: any) => [row.student_id, row]));
        students = students.map((student: any) => {
          const roster = rosterByStudent.get(student.id);
          return {
            ...student,
            roster_status: roster?.status ?? 'active',
            roster_started_at: roster?.started_at ?? null,
            roster_ended_at: roster?.ended_at ?? null,
            is_current_term_active: (roster?.status ?? 'active') === 'active',
          };
        });

        const currentIds = new Set(students.map((student: any) => student.id));
        const inactiveIds = rosterRows
          .filter((row: any) => row.status !== 'active' && !currentIds.has(row.student_id))
          .map((row: any) => row.student_id)
          .filter(Boolean);
        if (inactiveIds.length > 0) {
          const { data: inactiveProfiles } = await admin
            .from('portal_users')
            .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
            .in('id', inactiveIds)
            .eq('role', 'student')
            .order('full_name');
          formerStudents = (inactiveProfiles ?? []).map((student: any) => {
            const roster = rosterByStudent.get(student.id);
            return {
              ...student,
              roster_status: roster?.status ?? 'withdrawn',
              roster_started_at: roster?.started_at ?? null,
              roster_ended_at: roster?.ended_at ?? null,
              is_current_term_active: false,
            };
          });
        }
      }
    } catch (err) {
      console.warn('[class_term_rosters] unable to enrich class roster', err);
    }

    // ── Progress-report status per student — flags who still needs a published report THIS
    // term (the "needs attention" indicator). Term-scoped so a prior-term report doesn't hide
    // a missing current one. ──
    const allRosterIds = [
      ...students.map((s: any) => s.id),
      ...formerStudents.map((s: any) => s.id),
    ].filter(Boolean);
    const reportIndicatorEnabled = light ? false : await isReportIndicatorEnabled(admin);
    const pasteClaimEnabled = light ? false : await isPasteClaimEnabled(admin);
    if (reportIndicatorEnabled) {
      const academicPeriod = currentAcademicPeriod();
      const { data: canonicalTerm } = await admin.from('academic_terms').select('id')
        .eq('term_label', academicPeriod.termLabel)
        .eq('academic_year', academicPeriod.periodLabel)
        .maybeSingle();
      const { published: publishedSet, drafted: draftedSet } = await reportCoverageForStudents(admin, allRosterIds, {
        ...academicPeriod,
        termId: (canonicalTerm as { id?: string } | null)?.id ?? null,
      });
      const termLabel = formatAcademicSession(academicPeriod);
      const withReport = (s: any) => ({
        ...s,
        has_published_report: publishedSet.has(s.id),
        has_draft_report: draftedSet.has(s.id),
        report_term: termLabel,
        report_period: academicPeriod.periodLabel,
      });
      students = students.map(withReport);
      formerStudents = formerStudents.map(withReport);
    }

    // ── Sync current_students count from DB (not from local array) ───────────
    const { count: liveCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('role', 'student');
    const actualCount = liveCount ?? students.length;
    if (actualCount !== cls.current_students) {
      await admin.from('classes').update({ current_students: actualCount }).eq('id', classId);
    }

    return NextResponse.json(
      {
        students,
        former_students: formerStudents,
        roster: {
          active: students.filter((student: any) => student.is_current_term_active !== false).length,
          inactive: formerStudents.length + students.filter((student: any) => student.is_current_term_active === false).length,
          term_id: cls.term_id ?? null,
        },
        max_students: cls.max_students,
        total: actualCount,
        report_indicator_enabled: reportIndicatorEnabled,
        paste_claim_enabled: pasteClaimEnabled,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
