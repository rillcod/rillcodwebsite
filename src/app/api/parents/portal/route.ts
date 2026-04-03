import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  if (!profile.is_active) {
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
    const admin = createAdminClient();
    const url = new URL(req.url);
    const section = url.searchParams.get('section') ?? 'children';
    const childId = url.searchParams.get('child_id') ?? '';

    // ── Summary for all children ───────────────────────────────────────────
    if (section === 'summary') {
      const { data: children, error: childErr } = await admin
        .from('students')
        .select('*, user_id')
        .eq('parent_email', profile.email)
        .order('full_name');

      if (childErr) throw childErr;
      if (!children || children.length === 0) return NextResponse.json({ success: true, children: [] });

      // Pre-load teachers for these schools
      const uniqueSchools = [...new Set(children.map(k => k.school_name).filter(Boolean))] as string[];
      const { data: teachers } = uniqueSchools.length > 0
        ? await admin.from('portal_users').select('full_name, phone, section_class, school_name').eq('role', 'teacher').in('school_name', uniqueSchools)
        : { data: [] };

      const teachersBySchool: Record<string, any[]> = {};
      (teachers ?? []).forEach(t => {
        if (!t.school_name) return;
        if (!teachersBySchool[t.school_name]) teachersBySchool[t.school_name] = [];
        teachersBySchool[t.school_name].push(t);
      });

      const userIds = children.map(c => c.user_id).filter(Boolean) as string[];
      const studentIds = children.map(c => c.id);

      // Batch fetch stats
      const [attRes, invRes, certRes, gradeRes] = await Promise.all([
        userIds.length > 0 ? admin.from('attendance').select('user_id, status').in('user_id', userIds) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? admin.from('invoices').select('portal_user_id, status').in('portal_user_id', userIds).in('status', ['pending', 'overdue']) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? admin.from('certificates').select('portal_user_id').in('portal_user_id', userIds) : Promise.resolve({ data: [] }),
        userIds.length > 0 ? admin.from('student_progress_reports').select('student_id, overall_grade, report_date').in('student_id', userIds).eq('is_published', true).order('report_date', { ascending: false }) : Promise.resolve({ data: [] }),
      ]);

      const results = children.map(child => {
        const childAtt = (attRes.data ?? []).filter(a => a.user_id === child.user_id);
        const present = childAtt.filter(a => a.status === 'present').length;
        const attendancePct = childAtt.length > 0 ? Math.round((present / childAtt.length) * 100) : null;

        const childClass = (child.current_class || child.section || child.grade_level || '').toLowerCase().replace(/\s+/g, '');
        const schoolTeachers = child.school_name ? (teachersBySchool[child.school_name] ?? []) : [];
        const matchedTeacher = childClass
          ? schoolTeachers.find(t => {
              const tc = (t.section_class || '').toLowerCase().replace(/\s+/g, '');
              return tc && (tc === childClass || tc.startsWith(childClass) || childClass.startsWith(tc));
            }) ?? null
          : null;

        const latestGrade = (gradeRes.data ?? []).find(g => g.student_id === child.user_id)?.overall_grade ?? null;

        return {
          ...child,
          stats: {
            attendancePct,
            lastGrade: latestGrade,
            unpaidInvoices: (invRes.data ?? []).filter(i => i.portal_user_id === child.user_id).length,
            certificates: (certRes.data ?? []).filter(c => c.portal_user_id === child.user_id).length,
            teacherName: matchedTeacher?.full_name ?? null,
            teacherPhone: matchedTeacher?.phone ?? null,
          }
        };
      });

      return NextResponse.json({ success: true, children: results });
    }

    // ── Children list ────────────────────────────────────────────────────────
    if (section === 'children') {
      const { data: children, error } = await admin
        .from('students')
        .select('id, full_name, school_name, grade_level, section, current_class, status, user_id, profile_image_url')
        .eq('parent_email', profile.email)
        .order('full_name');

      if (error) throw error;
      return NextResponse.json({ success: true, children: children ?? [] });
    }

    // ── For all other sections we need child_id and must verify ownership ────
    if (!childId) {
      return NextResponse.json({ error: 'child_id is required' }, { status: 400 });
    }

    // Ownership check — the child must belong to this parent
    const { data: child, error: childErr } = await admin
      .from('students')
      .select('id, full_name, school_name, user_id')
      .eq('id', childId)
      .eq('parent_email', profile.email)
      .maybeSingle();

    if (childErr) throw childErr;
    if (!child) {
      return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });
    }

    // ── Grades ───────────────────────────────────────────────────────────────
    if (section === 'grades') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, grades: [], message: 'No portal account linked to this student yet' });
      }

      const [asgnRes, cbtRes] = await Promise.all([
        admin
          .from('assignment_submissions')
          .select('id, status, grade, feedback, submitted_at, assignments(title, max_points)')
          .eq('portal_user_id', child.user_id)
          .not('grade', 'is', null)
          .order('submitted_at', { ascending: false })
          .limit(50),
        admin
          .from('cbt_sessions')
          .select('id, status, score, end_time, cbt_exams(title, total_marks)')
          .eq('user_id', child.user_id)
          .not('score', 'is', null)
          .order('end_time', { ascending: false })
          .limit(50),
      ]);

      const grades = [
        ...(asgnRes.data ?? []).map((r: any) => ({
          id: r.id,
          type: 'assignment' as const,
          title: r.assignments?.title ?? 'Assignment',
          grade: r.grade,
          max_score: r.assignments?.max_points ?? null,
          status: r.status,
          submitted_at: r.submitted_at,
          feedback: r.feedback,
        })),
        ...(cbtRes.data ?? []).map((r: any) => ({
          id: r.id,
          type: 'exam' as const,
          title: r.cbt_exams?.title ?? 'CBT Exam',
          grade: r.score,
          max_score: r.cbt_exams?.total_marks ?? null,
          status: r.status,
          submitted_at: r.end_time,
          feedback: null,
        })),
      ].sort((a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime());

      return NextResponse.json({ success: true, grades });
    }

    // ── Results / Progress Reports ───────────────────────────────────────────
    if (section === 'results') {
      if (!child.user_id) {
        return NextResponse.json({ success: true, reports: [], message: 'No portal account linked yet' });
      }

      const { data: reports, error } = await admin
        .from('student_progress_reports')
        .select('id, course_name, report_term, theory_score, practical_score, attendance_score, overall_score, overall_grade, is_published, report_date, instructor_name, learning_milestones, key_strengths, areas_for_growth, participation_score')
        .eq('student_id', child.user_id)
        .eq('is_published', true)
        .order('report_date', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ success: true, reports: reports ?? [] });
    }

    // ── Invoices & Payments ──────────────────────────────────────────────────
    if (section === 'invoices') {
      const invoiceQuery = child.user_id
        ? admin
            .from('invoices')
            .select('id, invoice_number, amount, currency, status, due_date, notes, payment_link, items, created_at')
            .eq('portal_user_id', child.user_id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const paymentQuery = admin
        .from('payments')
        .select('id, amount, payment_method, payment_status, transaction_reference, payment_date, notes')
        .eq('student_id', childId)
        .order('payment_date', { ascending: false })
        .limit(30);

      const [invRes, payRes] = await Promise.all([invoiceQuery, paymentQuery]);
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
      const { data } = await admin
        .from('attendance')
        .select('id, status, notes, created_at, class_sessions(session_date, topic, classes(name))')
        .eq('user_id', child.user_id)
        .order('created_at', { ascending: false })
        .limit(60);

      const records = (data ?? []).map((r: any) => ({
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
      const { data } = await admin
        .from('certificates')
        .select('id, certificate_number, verification_code, issued_date, pdf_url, courses(title)')
        .eq('portal_user_id', child.user_id)
        .order('issued_date', { ascending: false });

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

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
  } catch (err: any) {
    console.error('GET /api/parents/portal error:', err);
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 });
  }
}
