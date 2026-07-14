import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getParentLinkScope, syncExplicitParentStudentLink } from '@/lib/parents/links';
import { withTimeout } from '@/lib/async-timeout';

// ── Auth guard: must be an active parent ─────────────────────────────────────
async function requireParent(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, email, full_name, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'parent') {
    return { error: 'Forbidden: parent accounts only', status: 403 as const };
  }
  if (profile.is_active === false) {
    return { error: 'Account deactivated. Contact your school admin.', status: 403 as const };
  }
  return { profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parents/portal
// Query params:
//   ?section=children                → list children linked to this parent
//   ?section=grades&child_id=<uuid>  → grades (submissions + cbt) for a child
//   ?section=results&child_id=<uuid> → published progress reports for a child
//   ?section=invoices&child_id=<uuid>→ invoices + payments for a child
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const guard = await requireParent(supabase);
    if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const { profile } = guard;
    const admin: any = createAdminClient();
    const url = new URL(req.url);
    const section = url.searchParams.get('section') ?? 'children';
    const childId = url.searchParams.get('child_id') ?? '';

    // ── Self-heal links ──────────────────────────────────────────────────────
    // Harmonise every onboarding source (summer school, online school, consent
    // forms): any student carrying THIS parent's email should have an explicit
    // parent_student_link. We reconcile on every open so the dashboard, CRM and
    // the link model stay in sync automatically — even for legacy/denormalised
    // records and parents with multiple children registered at different times.
    try {
      const email = profile.email?.trim().toLowerCase();
      if (email) {
        const { data: byEmail } = await admin
          .from('students')
          .select('id')
          .ilike('parent_email', email);
        for (const s of (byEmail ?? []) as Array<{ id: string }>) {
          await syncExplicitParentStudentLink(admin as any, profile.id, s.id);
        }
      }
    } catch (healErr) {
      console.error('[parents/portal] link self-heal failed:', healErr);
    }

    const linkScope = await getParentLinkScope(admin as any, {
      id: profile.id,
      email: profile.email,
    });
    const linkedIds = linkScope.studentIds;
    const linkedUserIds = linkScope.studentUserIds;

    // ── Summary for all children ───────────────────────────────────────────
    if (section === 'summary') {
      let childQuery = admin
        .from('students')
        .select('*, user_id')
        .order('full_name');
      if (linkedIds.length > 0) {
        childQuery = childQuery.in('id', linkedIds) as typeof childQuery;
      } else {
        return NextResponse.json({ success: true, children: [] });
      }
      const { data: children, error: childErr } = await childQuery;

      if (childErr) throw childErr;
      if (!children || children.length === 0) return NextResponse.json({ success: true, children: [] });

      // Pre-load teachers for these schools
      const uniqueSchools = [...new Set((children as any[]).map((k: any) => k.school_name).filter(Boolean))] as string[];
      const { data: teachers } = uniqueSchools.length > 0
        ? await admin.from('portal_users').select('full_name, phone, section_class, school_name').eq('role', 'teacher').in('school_name', uniqueSchools)
        : { data: [] };

      const teachersBySchool: Record<string, any[]> = {};
      (teachers ?? []).forEach((t: any) => {
        if (!t.school_name) return;
        if (!teachersBySchool[t.school_name]) teachersBySchool[t.school_name] = [];
        teachersBySchool[t.school_name].push(t);
      });

      // Pre-load WhatsApp groups for these schools to enable automated class chat onboarding
      const { data: waGroups } = uniqueSchools.length > 0
        ? await admin.from('whatsapp_groups').select('class_name, link, school_name, name').eq('status', 'active')
        : { data: [] };

      const userIds = (children as any[]).map((c: any) => c.user_id).filter(Boolean) as string[];
      const { liveAcademicSession } = await import('@/lib/reports/academic-period');
      const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
      const live = liveAcademicSession();
      const liveTermId = await resolveAssignmentTermId(admin as any, {});

      // Batch fetch stats — attendance + summary grade scoped to live year+term
      let attQuery = userIds.length > 0
        ? admin.from('attendance').select('user_id, status, term_id').in('user_id', userIds)
        : null;
      if (attQuery && liveTermId) {
        attQuery = attQuery.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof attQuery;
      }
      let gradeQuery = userIds.length > 0
        ? admin.from('student_progress_reports')
          .select('student_id, overall_grade, report_date, report_term, report_period, term_id')
          .in('student_id', userIds)
          .eq('is_published', true)
          .order('report_date', { ascending: false })
        : null;
      if (gradeQuery && liveTermId) {
        gradeQuery = gradeQuery.eq('term_id', liveTermId) as typeof gradeQuery;
      } else if (gradeQuery) {
        gradeQuery = gradeQuery
          .eq('report_term', live.termLabel)
          .eq('report_period', live.periodLabel) as typeof gradeQuery;
      }
      let prePortalGradeQuery = linkedIds.length > 0
        ? admin.from('student_progress_reports')
          .select('student_name, overall_grade, report_date, school_id, report_term, report_period, term_id')
          .is('student_id', null)
          .eq('is_published', true)
          .order('report_date', { ascending: false })
        : null;
      if (prePortalGradeQuery && liveTermId) {
        prePortalGradeQuery = prePortalGradeQuery.eq('term_id', liveTermId) as typeof prePortalGradeQuery;
      } else if (prePortalGradeQuery) {
        prePortalGradeQuery = prePortalGradeQuery
          .eq('report_term', live.termLabel)
          .eq('report_period', live.periodLabel) as typeof prePortalGradeQuery;
      }

      const [attRes, invRes, certRes, gradeRes, prePortalGradeRes] = await withTimeout(Promise.all([
        attQuery ?? Promise.resolve({ data: [] }),
        userIds.length > 0 ? admin.from('invoices').select('portal_user_id, status').in('portal_user_id', userIds).in('status', ['pending', 'sent', 'overdue', 'partially_paid']) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? admin.from('certificates').select('portal_user_id').in('portal_user_id', userIds) : Promise.resolve({ data: [] }),
        gradeQuery ?? Promise.resolve({ data: [] }),
        prePortalGradeQuery ?? Promise.resolve({ data: [] }),
      ]), [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }], 'parent summary stats');

      const results = (children as any[]).map((child: any) => {
        const childAtt = (attRes.data ?? []).filter((a: any) =>
          a.user_id === child.user_id
          && (!liveTermId || a.term_id === liveTermId || !a.term_id),
        );
        const present = childAtt.filter((a: any) => a.status === 'present').length;
        const attendancePct = childAtt.length > 0 ? Math.round((present / childAtt.length) * 100) : null;

        const childClass = (child.current_class || child.section || child.grade_level || '').toLowerCase().replace(/\s+/g, '');
        const schoolTeachers = child.school_name ? (teachersBySchool[child.school_name] ?? []) : [];
        const matchedTeacher = childClass
          ? schoolTeachers.find((t: any) => {
              const tc = (t.section_class || '').toLowerCase().replace(/\s+/g, '');
              return tc && (tc === childClass || tc.startsWith(childClass) || childClass.startsWith(tc));
            }) ?? null
          : null;

        const matchedGroup = (waGroups ?? []).find((g: any) => {
          const gc = (g.class_name || '').toLowerCase().replace(/\s+/g, '');
          return gc && (gc === childClass || gc.startsWith(childClass) || childClass.startsWith(gc));
        });

        const latestGrade = (gradeRes.data ?? []).find((g: any) => g.student_id === child.user_id)?.overall_grade
          ?? (prePortalGradeRes.data ?? []).find((g: any) => {
            const reportName = String(g.student_name ?? '').trim().toLowerCase();
            const childName = String(child.full_name ?? child.name ?? '').trim().toLowerCase();
            return reportName && childName && reportName === childName;
          })?.overall_grade
          ?? null;

        return {
          ...child,
          stats: {
            attendancePct,
            lastGrade: latestGrade,
            unpaidInvoices: (invRes.data ?? []).filter((i: any) => i.portal_user_id === child.user_id).length,
            certificates: (certRes.data ?? []).filter((c: any) => c.portal_user_id === child.user_id).length,
            teacherName: matchedTeacher?.full_name ?? null,
            teacherPhone: matchedTeacher?.phone ?? null,
            whatsappGroupLink: matchedGroup?.link ?? null,
          }
        };
      });

      return NextResponse.json({ success: true, children: results });
    }

    // ── Children list ────────────────────────────────────────────────────────
    if (section === 'children') {
      let childQuery = admin
        .from('students')
        .select('id, full_name, school_name, grade_level, section, current_class, status, user_id')
        .order('full_name');
      if (linkedIds.length > 0) {
        childQuery = childQuery.in('id', linkedIds) as typeof childQuery;
      } else {
        return NextResponse.json({ success: true, children: [] });
      }
      const { data: children, error } = await childQuery;

      if (error) throw error;
      return NextResponse.json({ success: true, children: children ?? [] });
    }

    // ── For all other sections we need child_id and must verify ownership ────
    if (!childId) {
      return NextResponse.json({ error: 'child_id is required' }, { status: 400 });
    }

    // Ownership check — the child must belong to this parent
    let childScopeQuery = admin
      .from('students')
      .select('id, full_name, school_id, school_name, user_id')
      .eq('id', childId);
    if (linkedIds.length > 0) {
      childScopeQuery = childScopeQuery.in('id', linkedIds) as typeof childScopeQuery;
    } else {
      return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
    }
    const { data: child, error: childErr } = await childScopeQuery.maybeSingle();

    if (childErr) throw childErr;
    if (!child) {
      return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
    }

    // ── Grades ───────────────────────────────────────────────────────────────
    if (section === 'grades') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, grades: [], message: 'No portal account linked to this student yet' });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }

      const [asgnRes, cbtRes] = await withTimeout(Promise.all([
        admin
          .from('assignment_submissions')
          .select('id, status, grade, feedback, submitted_at, assignments(title, max_points, course_id, term_id, courses(title))')
          .eq('portal_user_id', child.user_id)
          .not('grade', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(80),
        admin
          .from('cbt_sessions')
          .select('id, status, score, end_time, needs_grading, cbt_exams(title, total_marks, course_id, program_id, metadata)')
          .eq('user_id', child.user_id)
          .not('score', 'is', null)
          .order('end_time', { ascending: false })
          .limit(50),
      ]), [{ data: [] }, { data: [] }], 'parent grades');

      const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
      const liveTermId = await resolveAssignmentTermId(admin as any, {});
      const termBounds = await loadAcademicTermBounds(admin as any, liveTermId);
      const asgnRows = filterByAssignmentSession((asgnRes.data ?? []) as any[], liveTermId).slice(0, 50);
      const cbtRows = filterCbtByAcademicTerm((cbtRes.data ?? []) as any[], liveTermId, termBounds, {
        includeUntagged: true,
      }).slice(0, 30);

      const grades = [
        ...asgnRows.map((r: any) => ({
          id: r.id,
          type: 'assignment' as const,
          title: r.assignments?.title ?? 'Assignment',
          course_title: r.assignments?.courses?.title ?? null,
          grade: r.grade,
          max_score: r.assignments?.max_points ?? null,
          status: r.status,
          submitted_at: r.submitted_at,
          feedback: r.feedback,
        })),
        ...cbtRows.map((r: any) => ({
          id: r.id,
          type: 'exam' as const,
          title: r.cbt_exams?.title ?? 'CBT Exam',
          exam_type: r.cbt_exams?.metadata?.exam_type ?? 'examination',
          grade: r.score,
          max_score: r.cbt_exams?.total_marks ?? null,
          status: r.needs_grading ? 'pending_grading' : r.status,
          submitted_at: r.end_time,
          feedback: r.needs_grading ? 'Awaiting teacher review for subjective answers.' : null,
        })),
      ].sort((a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime());

      return NextResponse.json({ success: true, grades });
    }

    // ── Results / Progress Reports ───────────────────────────────────────────
    if (section === 'results') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, reports: [], message: 'No portal account linked yet' });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }

      const { data: reports, error } = await withTimeout(admin
        .from('student_progress_reports')
        .select('id, course_name, report_term, report_period, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, report_date, instructor_name, learning_milestones, key_strengths, areas_for_growth, participation_score')
        .eq('student_id', child.user_id)
        .eq('is_published', true)
        .order('report_date', { ascending: false }), { data: [], error: null }, 'parent reports by portal id');

      if (error) throw error;
      let finalReports = reports ?? [];
      if (finalReports.length === 0) {
        let fallbackQuery = admin
          .from('student_progress_reports')
          .select('id, course_name, report_term, report_period, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, report_date, instructor_name, learning_milestones, key_strengths, areas_for_growth, participation_score')
          .is('student_id', null)
          .eq('student_name', child.full_name)
          .eq('is_published', true)
          .order('report_date', { ascending: false });
        if ((child as any).school_id) fallbackQuery = fallbackQuery.eq('school_id', (child as any).school_id) as typeof fallbackQuery;
        const { data: fallbackReports } = await withTimeout(fallbackQuery, { data: [], error: null }, 'parent pre-portal reports');
        finalReports = fallbackReports ?? [];
      }
      return NextResponse.json({
        success: true,
        reports: finalReports,
        message: finalReports.length === 0 ? 'No published reports are available for this child yet.' : undefined,
      });
    }

    // ── Invoices & Payments ──────────────────────────────────────────────────
    if (section === 'invoices') {
      if (child.user_id && !linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }
      const invoiceQuery = child.user_id
        ? admin
            .from('invoices')
            .select('id, invoice_number, amount, currency, status, due_date, notes, payment_link, items, created_at')
            .eq('portal_user_id', child.user_id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const paymentQuery = child.user_id
        ? admin
            .from('payment_transactions')
            .select('id, amount, currency, payment_method, payment_status, transaction_reference, paid_at, created_at, receipt_url, invoice_id')
            .eq('portal_user_id', child.user_id)
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null });

      const [invRes, payRes] = await withTimeout(
        Promise.all([invoiceQuery, paymentQuery]),
        [{ data: [], error: null }, { data: [], error: null }],
        'parent invoices and payments',
      );
      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;

      return NextResponse.json({
        success: true,
        invoices: invRes.data ?? [],
        payments: payRes.data ?? [],
      });
    }

    // ── Attendance ─────────────────────────────────────────────────────────
    if (section === 'attendance') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, records: [] });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }
      const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
      const liveTermId = await resolveAssignmentTermId(admin as any, {});
      let attQuery = admin
        .from('attendance')
        .select('id, status, notes, created_at, term_id, class_sessions(session_date, topic, classes(name))')
        .eq('user_id', child.user_id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (liveTermId) {
        attQuery = attQuery.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof attQuery;
      }
      const { data } = await withTimeout(attQuery, { data: [], error: null }, 'parent attendance');

      const records = ((data ?? []) as any[])
        .filter((r) => !liveTermId || r.term_id === liveTermId || !r.term_id)
        .map((r: any) => ({
        id: r.id,
        date: r.class_sessions?.session_date ?? r.created_at?.slice(0, 10) ?? '',
        status: r.status,
        note: r.notes,
        course_name: r.class_sessions?.classes?.name ?? r.class_sessions?.topic ?? null,
      }));

      return NextResponse.json({ success: true, records });
    }

    // ── Certificates ────────────────────────────────────────────────────────
    if (section === 'certificates') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, certs: [] });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }
      const { data } = await withTimeout(admin
        .from('certificates')
        .select('id, certificate_number, verification_code, issued_date, pdf_url, courses(title)')
        .eq('portal_user_id', child.user_id)
        .order('issued_date', { ascending: false }), { data: [], error: null }, 'parent certificates');

      const certs = (data ?? []).map((c: any) => ({
        id: c.id,
        certificate_number: c.certificate_number,
        verification_code: c.verification_code,
        issued_date: c.issued_date,
        pdf_url: c.pdf_url,
        course_title: c.courses?.title ?? null,
      }));

      return NextResponse.json({ success: true, certs });
    }

    // ── Activity Feed — combines attendance, submissions, certificates, exams ──
    if (section === 'activity') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, events: [] });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }
      const since = new Date(Date.now() - 90 * 86400000).toISOString(); // last 90 days
      const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
      const liveTermId = await resolveAssignmentTermId(admin as any, {});
      const termBounds = await loadAcademicTermBounds(admin as any, liveTermId);

      const [attRes, subRes, certRes, cbtRes] = await withTimeout(Promise.all([
        (() => {
          let q = admin.from('attendance').select('id, status, created_at, term_id, class_sessions(session_date, topic, classes(name))').eq('user_id', child.user_id).gte('created_at', since).order('created_at', { ascending: false }).limit(40);
          if (liveTermId) q = q.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof q;
          return q;
        })(),
        admin.from('assignment_submissions').select('id, status, grade, submitted_at, assignments(title, max_points, term_id)').eq('portal_user_id', child.user_id).gte('submitted_at', since).order('submitted_at', { ascending: false }).limit(40),
        admin.from('certificates').select('id, issued_date, courses(title)').eq('portal_user_id', child.user_id).gte('issued_date', since).order('issued_date', { ascending: false }).limit(10),
        admin.from('cbt_sessions').select('id, status, score, end_time, needs_grading, cbt_exams(title, total_marks, metadata)').eq('user_id', child.user_id).gte('end_time', since).not('score', 'is', null).order('end_time', { ascending: false }).limit(20),
      ]), [{ data: [] }, { data: [] }, { data: [] }, { data: [] }], 'parent activity');

      const scopedSubs = filterByAssignmentSession((subRes.data ?? []) as any[], liveTermId).slice(0, 20);
      const scopedCbt = filterCbtByAcademicTerm((cbtRes.data ?? []) as any[], liveTermId, termBounds, {
        includeUntagged: true,
      }).slice(0, 10);
      const scopedAtt = ((attRes.data ?? []) as any[])
        .filter((r) => !liveTermId || r.term_id === liveTermId || !r.term_id)
        .slice(0, 30);

      type FeedEvent = { id: string; type: string; title: string; detail: string | null; date: string; icon: string; color: string };
      const events: FeedEvent[] = [];

      scopedAtt.forEach((r: any) => {
        const date = r.class_sessions?.session_date ?? r.created_at?.slice(0, 10) ?? '';
        const cls = r.class_sessions?.classes?.name ?? r.class_sessions?.topic ?? 'STEM session';
        if (r.status === 'present') events.push({ id: r.id, type: 'attendance', title: `Attended: ${cls}`, detail: null, date, icon: '✅', color: 'emerald' });
        else events.push({ id: r.id, type: 'absence', title: `Missed: ${cls}`, detail: null, date, icon: '❌', color: 'rose' });
      });

      scopedSubs.forEach((r: any) => {
        const title = r.assignments?.title ?? 'Assignment';
        const pct = r.grade != null && r.assignments?.max_points ? `${Math.round((r.grade / r.assignments.max_points) * 100)}%` : r.grade != null ? `${r.grade} pts` : null;
        events.push({ id: r.id, type: 'submission', title: `Submitted: ${title}`, detail: pct ? `Scored ${pct}` : null, date: r.submitted_at?.slice(0, 10) ?? '', icon: '📝', color: 'primary' });
      });

      (certRes.data ?? []).forEach((r: any) => {
        events.push({ id: r.id, type: 'certificate', title: `Certificate earned: ${(r.courses as any)?.title ?? 'Course'}`, detail: null, date: r.issued_date ?? '', icon: '🏆', color: 'amber' });
      });

      scopedCbt.forEach((r: any) => {
        const pct = r.score != null && r.cbt_exams?.total_marks ? `${Math.round((r.score / r.cbt_exams.total_marks) * 100)}%` : `${r.score} pts`;
        events.push({ id: r.id, type: 'exam', title: `Exam: ${r.cbt_exams?.title ?? 'CBT Exam'}`, detail: `Scored ${pct}`, date: r.end_time?.slice(0, 10) ?? '', icon: '🎯', color: 'sky' });
      });

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return NextResponse.json({ success: true, events: events.slice(0, 30), child_name: child.full_name });
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
  } catch (err: any) {
    console.error('GET /api/parents/portal error:', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
