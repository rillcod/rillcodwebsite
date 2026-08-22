import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getParentLinkScope, healParentEmailLinks } from '@/lib/parents/links';
import { loadParentLearnerRosterContext, parentLearnerEnrollmentFields } from '@/lib/parents/learner-roster-status';
import { withTimeoutOrThrow } from '@/lib/async-timeout';
import { describeLedgerEntry } from '@/lib/finance/ledger-description';
import { fetchAllReportRows } from '@/lib/school-reports/paginated-query';
import { getResultConsentAccessStatus } from '@/lib/consent/result-access';
import { deriveFamilyLifecycle } from '@/lib/onboarding/lifecycle-state';

function assertQueryResults(results: Array<{ error?: { message?: string } | null }>, label: string) {
  const failed = results.find(result => result.error);
  if (failed?.error) {
    throw new Error(`${label}: ${failed.error.message || 'database request failed'}`);
  }
}

async function liveEvidenceSessionPayload() {
  const { evidenceSessionPayload } = await import('@/lib/reports/session-scope');
  return evidenceSessionPayload();
}

// ── Auth guard: must be an active parent ─────────────────────────────────────
async function requireParent(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: profile, error: profileError } = await supabase
    .from('portal_users')
    .select('id, role, email, full_name, is_active')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[parents/portal] parent profile verification failed:', profileError);
    return { error: 'Unable to verify the parent account right now. Please try again.', status: 503 as const };
  }

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
    // Promote legacy parent_email matches onto parent_student_links only when
    // no other parent already owns the child (fail-closed ownership).
    let linkHealingError: unknown = null;
    try {
      await healParentEmailLinks(admin as any, { id: profile.id, email: profile.email }, { actorId: profile.id });
    } catch (healErr) {
      console.error('[parents/portal] link self-heal failed:', healErr);
      linkHealingError = healErr;
    }

    const linkScope = await getParentLinkScope(admin as any, {
      id: profile.id,
      email: profile.email,
    });
    const linkedIds = linkScope.studentIds;
    const linkedUserIds = linkScope.studentUserIds;
    if (linkHealingError && linkedIds.length === 0) {
      throw new Error('Parent/student link verification failed before a complete ownership result was available.');
    }

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

      const rosterFields = await loadParentLearnerRosterContext(admin, children as any[]);

      // Pre-load teachers for these schools
      const uniqueSchools = [...new Set((children as any[]).map((k: any) => k.school_name).filter(Boolean))] as string[];
      const { data: teachers, error: teachersError } = uniqueSchools.length > 0
        ? await admin.from('portal_users').select('full_name, phone, section_class, school_name').eq('role', 'teacher').in('school_name', uniqueSchools)
        : { data: [], error: null };
      if (teachersError) throw teachersError;

      const teachersBySchool: Record<string, any[]> = {};
      (teachers ?? []).forEach((t: any) => {
        if (!t.school_name) return;
        if (!teachersBySchool[t.school_name]) teachersBySchool[t.school_name] = [];
        teachersBySchool[t.school_name].push(t);
      });

      // Pre-load WhatsApp groups for these schools to enable automated class chat onboarding
      const { data: waGroups, error: waGroupsError } = uniqueSchools.length > 0
        ? await admin.from('whatsapp_groups').select('class_name, link, school_name, name').eq('status', 'active')
        : { data: [], error: null };
      if (waGroupsError) throw waGroupsError;

      const userIds = (children as any[]).map((c: any) => c.user_id).filter(Boolean) as string[];
      const { data: learnerProfiles, error: learnerProfilesError } = userIds.length > 0
        ? await admin
          .from('portal_users')
          .select('id, class_id, section_class, enrollment_type')
          .in('id', userIds)
        : { data: [], error: null };
      if (learnerProfilesError) throw learnerProfilesError;
      const learnerProfileById = new Map((learnerProfiles ?? []).map((item: any) => [item.id, item]));
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

      const [attRes, invRes, certRes, gradeRes, prePortalGradeRes] = await withTimeoutOrThrow(Promise.all([
        attQuery ?? Promise.resolve({ data: [], error: null }),
        userIds.length > 0 ? admin.from('invoices').select('portal_user_id, status').in('portal_user_id', userIds).in('status', ['pending', 'sent', 'overdue', 'partially_paid']) : Promise.resolve({ data: [], error: null }),
        userIds.length > 0 ? admin.from('certificates').select('portal_user_id').in('portal_user_id', userIds) : Promise.resolve({ data: [], error: null }),
        gradeQuery ?? Promise.resolve({ data: [], error: null }),
        prePortalGradeQuery ?? Promise.resolve({ data: [], error: null }),
      ]), 'The parent summary is taking too long. Please try again.');
      assertQueryResults([attRes, invRes, certRes, gradeRes, prePortalGradeRes], 'Could not load the complete parent summary');

      const results = await Promise.all((children as any[]).map(async (child: any) => {
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

        const enrollment = rosterFields.get(child.id) ?? parentLearnerEnrollmentFields({
          studentStatus: child.status,
          rosterInactive: false,
        });
        const unpaidInvoices = (invRes.data ?? []).filter((i: any) => i.portal_user_id === child.user_id).length;
        const learnerProfile = learnerProfileById.get(child.user_id) as any;
        let consentStatus;
        let consentStatusAvailable = true;
        try {
          consentStatus = child.user_id
            ? await getResultConsentAccessStatus(admin as any, {
              studentUserId: child.user_id,
              schoolId: child.school_id,
              classId: learnerProfile?.class_id ?? null,
              enrollmentType: learnerProfile?.enrollment_type ?? child.enrollment_type ?? 'school',
              parentId: profile.id,
            })
            : { required: false, complete: true, form: null, formUrl: null };
        } catch (consentError) {
          consentStatusAvailable = false;
          console.error('[parents/portal] consent lifecycle status failed:', {
            studentId: child.id,
            error: consentError,
          });
        }
        const lifecycle = deriveFamilyLifecycle({
          childId: child.id,
          enrollmentActive: enrollment.is_enrollment_active,
          consentRequired: consentStatus?.required,
          consentComplete: consentStatus?.complete,
          consentStatusAvailable,
          consentFormUrl: consentStatus?.formUrl,
          consentFormTitle: consentStatus?.form?.title,
          unpaidInvoiceCount: unpaidInvoices,
        });

        return {
          ...child,
          ...enrollment,
          lifecycle,
          stats: {
            attendancePct,
            lastGrade: latestGrade,
            unpaidInvoices,
            certificates: (certRes.data ?? []).filter((c: any) => c.portal_user_id === child.user_id).length,
            teacherName: matchedTeacher?.full_name ?? null,
            teacherPhone: matchedTeacher?.phone ?? null,
            whatsappGroupLink: matchedGroup?.link ?? null,
          },
        };
      }));

      return NextResponse.json({
        success: true,
        children: results,
        evidenceSession: await liveEvidenceSessionPayload(),
      });
    }

    // ── Children list ────────────────────────────────────────────────────────
    if (section === 'children') {
      let childQuery = admin
        .from('students')
        .select('id, full_name, school_name, school_id, grade_level, section, current_class, status, user_id')
        .order('full_name');
      if (linkedIds.length > 0) {
        childQuery = childQuery.in('id', linkedIds) as typeof childQuery;
      } else {
        return NextResponse.json({ success: true, children: [] });
      }
      const { data: children, error } = await childQuery;

      if (error) throw error;
      const rosterFields = await loadParentLearnerRosterContext(admin, children ?? []);
      const schoolIds = [...new Set((children ?? []).map((child: any) => child.school_id).filter(Boolean))];
      const { data: standingRows } = schoolIds.length
        ? await admin.from('schools').select('id, programme_standing').in('id', schoolIds)
        : { data: [] as Array<{ id: string; programme_standing: string }> };
      const standingBySchool = new Map((standingRows ?? []).map((row: any) => [row.id, row.programme_standing]));
      const enriched = (children ?? []).map((child: any) => {
        const fields = rosterFields.get(child.id) ?? parentLearnerEnrollmentFields({
          studentStatus: child.status,
          rosterInactive: false,
        });
        return {
          ...child,
          ...fields,
          programme_standing: standingBySchool.get(child.school_id) === 'compulsory' ? 'compulsory' : 'optional',
        };
      });
      return NextResponse.json({ success: true, children: enriched });
    }

    // ── For all other sections we need child_id and must verify ownership ────
    if (!childId) {
      return NextResponse.json({ error: 'child_id is required' }, { status: 400 });
    }

    // Ownership check — the child must belong to this parent
    let childScopeQuery = admin
      .from('students')
      .select('id, full_name, school_id, school_name, user_id, status')
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

    const childEnrollmentFields =
      (await loadParentLearnerRosterContext(admin, [child])).get(child.id) ??
      parentLearnerEnrollmentFields({ studentStatus: (child as any).status, rosterInactive: false });

    // ── Grades ───────────────────────────────────────────────────────────────
    if (section === 'grades') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, grades: [], message: 'No portal account linked to this student yet' });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }

      const [asgnRes, cbtRes] = await withTimeoutOrThrow(Promise.all([
        fetchAllReportRows<any>((from, to) => admin
          .from('assignment_submissions')
          .select('id, status, grade, feedback, submitted_at, assignments(id, title, max_points, course_id, term_id, courses(title))')
          .eq('portal_user_id', child.user_id)
          .not('grade', 'is', null)
          .order('submitted_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)),
        fetchAllReportRows<any>((from, to) => admin
          .from('cbt_sessions')
          .select('id, status, score, end_time, needs_grading, cbt_exams(id, title, course_id, program_id, metadata)')
          .eq('user_id', child.user_id)
          .not('score', 'is', null)
          .order('end_time', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)),
      ]), 'The complete grade history is taking too long. Please try again.');
      assertQueryResults([asgnRes, cbtRes], 'Could not load the complete grade history');

      const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
      const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
      const liveTermId = await resolveAssignmentTermId(admin as any, {});
      const termBounds = await loadAcademicTermBounds(admin as any, liveTermId);
      const asgnRows = filterByAssignmentSession((asgnRes.data ?? []) as any[], liveTermId);
      const cbtRows = filterCbtByAcademicTerm((cbtRes.data ?? []) as any[], liveTermId, termBounds, {
        includeUntagged: true,
      });

      const grades = [
        ...asgnRows.map((r: any) => ({
          id: r.id,
          resource_id: r.assignments?.id ?? null,
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
          resource_id: r.cbt_exams?.id ?? null,
          type: 'exam' as const,
          title: r.cbt_exams?.title ?? 'CBT Exam',
          exam_type: r.cbt_exams?.metadata?.exam_type ?? 'examination',
          grade: r.score,
          // cbt_sessions.score is stored as a percentage — Math.round((earned/totalPoints)*100)
          // in /api/cbt/sessions/[id]. The denominator is therefore always 100. cbt_exams has no
          // total_marks column, and asking for it failed the whole read, so parents saw no exams.
          max_score: 100,
          status: r.needs_grading ? 'pending_grading' : r.status,
          submitted_at: r.end_time,
          feedback: r.needs_grading ? 'Awaiting teacher review for subjective answers.' : null,
        })),
      ].sort((a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime());

      return NextResponse.json({
        success: true,
        grades,
        evidenceSession: await liveEvidenceSessionPayload(),
        child_status: (child as any).status ?? null,
        ...childEnrollmentFields,
      });
    }

    // ── Results / Progress Reports ───────────────────────────────────────────
    if (section === 'results') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, reports: [], message: 'No portal account linked yet' });
      }
      if (!linkedUserIds.includes(child.user_id)) {
        return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
      }

      const { data: reports, error } = await withTimeoutOrThrow(fetchAllReportRows<any>((from, to) => admin
        .from('student_progress_reports')
        .select('id, course_name, report_term, report_period, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, report_date, instructor_name, learning_milestones, key_strengths, areas_for_growth, participation_score, engagement_metrics')
        .eq('student_id', child.user_id)
        .eq('is_published', true)
        .order('report_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)), 'Published reports are taking too long to load. Please try again.');

      if (error) throw error;
      let finalReports = reports ?? [];
      if (finalReports.length === 0) {
        let fallbackQuery = admin
          .from('student_progress_reports')
          .select('id, course_name, report_term, report_period, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, report_date, instructor_name, learning_milestones, key_strengths, areas_for_growth, participation_score, engagement_metrics')
          .is('student_id', null)
          .eq('student_name', child.full_name)
          .eq('is_published', true)
          .order('report_date', { ascending: false });
        if ((child as any).school_id) fallbackQuery = fallbackQuery.eq('school_id', (child as any).school_id) as typeof fallbackQuery;
        const { data: fallbackReports, error: fallbackError } = await withTimeoutOrThrow<{ data: any[] | null; error: any }>(
          fallbackQuery,
          'Earlier published reports are taking too long to load. Please try again.',
        );
        if (fallbackError) throw fallbackError;
        finalReports = fallbackReports ?? [];
      }
      let programmeStanding: 'optional' | 'compulsory' = 'optional';
      if ((child as any).school_id) {
        const { data: schoolRow } = await admin
          .from('schools')
          .select('programme_standing')
          .eq('id', (child as any).school_id)
          .maybeSingle();
        programmeStanding = schoolRow?.programme_standing === 'compulsory' ? 'compulsory' : 'optional';
      }
      return NextResponse.json({
        success: true,
        reports: finalReports,
        programme_standing: programmeStanding,
        message: finalReports.length === 0 ? 'No published reports are available for this child yet.' : undefined,
        child_status: (child as any).status ?? null,
        ...childEnrollmentFields,
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
            .select('id, amount, currency, payment_method, payment_status, transaction_reference, paid_at, created_at, receipt_url, invoice_id, payment_gateway_response, portal_users!payment_transactions_portal_user_id_fkey(full_name, email), courses(title), invoices!payment_transactions_invoice_id_fkey(invoice_number, items, stream, billing_cycle_id, school_id)')
            .eq('portal_user_id', child.user_id)
            .order('created_at', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null });

      const [invRes, payRes] = await withTimeoutOrThrow(
        Promise.all([invoiceQuery, paymentQuery]),
        'Invoices and payments are taking too long to load. Please try again.',
      );
      if (invRes.error) throw invRes.error;
      if (payRes.error) throw payRes.error;

      return NextResponse.json({
        success: true,
        invoices: invRes.data ?? [],
        payments: (payRes.data ?? []).map((row: Record<string, unknown>) => ({
          ...row,
          ...describeLedgerEntry(row as Parameters<typeof describeLedgerEntry>[0]),
        })),
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
        .select('id, status, notes, created_at, term_id, class_sessions!attendance_session_id_fkey(session_date, topic, classes!class_sessions_class_id_fkey(name))')
        .eq('user_id', child.user_id)
        .order('created_at', { ascending: false })
        .limit(60);
      if (liveTermId) {
        attQuery = attQuery.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof attQuery;
      }
      const { data, error } = await withTimeoutOrThrow<{ data: any[] | null; error: any }>(
        attQuery,
        'Attendance is taking too long to load. Please try again.',
      );
      if (error) throw error;

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
      const { data, error } = await withTimeoutOrThrow<{ data: any[] | null; error: any }>(admin
        .from('certificates')
        .select('id, certificate_number, verification_code, issued_date, pdf_url, courses(title)')
        .eq('portal_user_id', child.user_id)
        .order('issued_date', { ascending: false }), 'Certificates are taking too long to load. Please try again.');
      if (error) throw error;

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

      const [attRes, subRes, certRes, cbtRes] = await withTimeoutOrThrow(Promise.all([
        (() => {
          let q = admin.from('attendance').select('id, status, created_at, term_id, class_sessions!attendance_session_id_fkey(session_date, topic, classes!class_sessions_class_id_fkey(name))').eq('user_id', child.user_id).gte('created_at', since).order('created_at', { ascending: false }).limit(40);
          if (liveTermId) q = q.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof q;
          return q;
        })(),
        admin.from('assignment_submissions').select('id, status, grade, submitted_at, assignments(title, max_points, term_id)').eq('portal_user_id', child.user_id).gte('submitted_at', since).order('submitted_at', { ascending: false }).limit(40),
        admin.from('certificates').select('id, issued_date, courses(title)').eq('portal_user_id', child.user_id).gte('issued_date', since).order('issued_date', { ascending: false }).limit(10),
        admin.from('cbt_sessions').select('id, status, score, end_time, needs_grading, cbt_exams(title, metadata)').eq('user_id', child.user_id).gte('end_time', since).not('score', 'is', null).order('end_time', { ascending: false }).limit(20),
      ]), 'Recent activity is taking too long to load. Please try again.');
      assertQueryResults([attRes, subRes, certRes, cbtRes], 'Could not load complete recent activity');

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
        // cbt_sessions.score is already a percentage, so dividing it again was wrong twice over:
        // cbt_exams has no total_marks column, so this always fell through to the "pts" branch and
        // reported a score of 85% to a parent as "85 pts".
        const pct = r.score != null ? `${r.score}%` : 'not scored';
        events.push({ id: r.id, type: 'exam', title: `Exam: ${r.cbt_exams?.title ?? 'CBT Exam'}`, detail: `Scored ${pct}`, date: r.end_time?.slice(0, 10) ?? '', icon: '🎯', color: 'sky' });
      });

      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return NextResponse.json({ success: true, events: events.slice(0, 30), child_name: child.full_name });
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
  } catch (err: any) {
    console.error('GET /api/parents/portal error:', err);
    return NextResponse.json({
      error: 'We could not load this parent portal section right now. Please try again.',
      code: 'PARENT_PORTAL_UNAVAILABLE',
    }, { status: 500 });
  }
}
