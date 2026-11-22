import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { reportCoverageForStudents, currentAcademicPeriod } from '@/lib/reports/coverage';
import { isReportIndicatorEnabled, isPasteClaimEnabled } from '@/lib/server/app-settings';
import { generateTempPassword } from '@/lib/utils/password';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';

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

    // The roster, direct assignments and legacy section candidates are three
    // views of the same class identity. Read them together, and reuse the one
    // roster result for both withdrawn guards and status enrichment below.
    let rosterQuery = (admin as any)
      .from('class_term_rosters')
      .select('id, student_id, status, started_at, ended_at, reinstated_at, term_id')
      .eq('class_id', classId);
    rosterQuery = cls.term_id ? rosterQuery.eq('term_id', cls.term_id) : rosterQuery.is('term_id', null);

    const sectionQuery = cls.school_id && cls.name
      ? admin
          .from('portal_users')
          .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
          .eq('school_id', cls.school_id)
          .eq('section_class', cls.name)
          .is('class_id', null)
          .eq('role', 'student')
          .order('full_name')
      : Promise.resolve({ data: [], error: null });

    const [directResult, rosterResult, sectionResult] = await Promise.all([
      admin
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
        .eq('class_id', classId)
        .eq('role', 'student')
        .order('full_name'),
      rosterQuery,
      sectionQuery,
    ]);
    const { data: directStudents, error: directErr } = directResult;
    if (directErr) return NextResponse.json({ error: directErr.message }, { status: 500 });
    if (rosterResult.error) {
      console.warn('[class_term_rosters] unable to enrich class roster', rosterResult.error);
    }
    if (sectionResult.error) {
      console.warn('[students API] legacy section candidates unavailable', sectionResult.error);
    }
    const rosterRows: any[] = !rosterResult.error && Array.isArray(rosterResult.data)
      ? rosterResult.data
      : [];
    const knownIds = new Set((directStudents ?? []).map((s: any) => s.id));

    // Students deliberately withdrawn from this class must never be silently
    // re-added by the section-name compatibility heal.
    const withdrawnFromThisClass = new Set<string>();
    rosterRows
      .filter((row: any) => row.status !== 'active')
      .forEach((row: any) => row.student_id && withdrawnFromThisClass.add(row.student_id));

    let sectionStudents = (sectionResult.data ?? []).filter(
      (student: any) => !knownIds.has(student.id) && !withdrawnFromThisClass.has(student.id),
    );
    if (sectionStudents.length > 0) {
      const sectionIds = sectionStudents.map((student: any) => student.id);
      const { error: healError } = await admin
        .from('portal_users')
        .update({ class_id: classId })
        .in('id', sectionIds)
        .eq('role', 'student');
      if (healError) {
        console.error('[students API] section-class repair failed', healError);
        return NextResponse.json(
          { error: 'Student records need repair before this roster can be loaded. Please retry.' },
          { status: 503 },
        );
      }
      sectionStudents = sectionStudents.map((student: any) => ({ ...student, class_id: classId }));
      console.log(`[students API] class="${cls.name}" (${classId}) auto-healed ${sectionIds.length} section_class-matched student(s)`);
    }

    let students = [...(directStudents ?? []), ...sectionStudents];

    // Settings, current-count verification and the reporting period do not
    // depend on the profile enrichment below. Start them now so opening the
    // roster does not pay for those reads one after another.
    const academicPeriod = currentAcademicPeriod();
    const rosterSettingsPromise: Promise<[boolean, boolean]> = light
      ? Promise.resolve([false, false])
      : Promise.all([
          isReportIndicatorEnabled(admin),
          isPasteClaimEnabled(admin),
        ]);
    const canonicalTermPromise = light
      ? Promise.resolve({ data: null as { id?: string } | null })
      : Promise.resolve(
          admin
            .from('academic_terms')
            .select('id')
            .eq('term_label', academicPeriod.termLabel)
            .eq('academic_year', academicPeriod.periodLabel)
            .maybeSingle(),
        );
    const liveCountPromise = Promise.resolve(
      admin
        .from('portal_users')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', classId)
        .eq('role', 'student'),
    );

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
      const { data: inactiveProfiles, error: inactiveError } = await admin
        .from('portal_users')
        .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
        .in('id', inactiveIds)
        .eq('role', 'student')
        .order('full_name');
      if (inactiveError) {
        console.warn('[class_term_rosters] former student profiles unavailable', inactiveError);
      }
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

    // ── Progress-report status per student — flags who still needs a published report THIS
    // term (the "needs attention" indicator). Term-scoped so a prior-term report doesn't hide
    // a missing current one. ──
    const allRosterIds = [
      ...students.map((s: any) => s.id),
      ...formerStudents.map((s: any) => s.id),
    ].filter(Boolean);
    const [[reportIndicatorEnabled, pasteClaimEnabled], canonicalTermResult, liveCountResult] =
      await Promise.all([rosterSettingsPromise, canonicalTermPromise, liveCountPromise]);
    // ?with_reports=1 (class ID-card / RC roster screen) always needs report status,
    // even when the roster indicator setting is switched off.
    const forceReports = new URL(_request.url).searchParams.get('with_reports') === '1';
    if (reportIndicatorEnabled || forceReports) {
      const { published: publishedSet, drafted: draftedSet } = await reportCoverageForStudents(admin, allRosterIds, {
        ...academicPeriod,
        termId: (canonicalTermResult.data as { id?: string } | null)?.id ?? null,
      });
      const withReport = (s: any) => ({
        ...s,
        has_published_report: publishedSet.has(s.id),
        has_draft_report: draftedSet.has(s.id),
        report_term: academicPeriod.termLabel,
        report_period: academicPeriod.periodLabel,
      });
      students = students.map(withReport);
      formerStudents = formerStudents.map(withReport);
    }

    // ?with_credentials=1 attaches the latest archived temp password from registration_results
    // so teachers can print a single unified sheet (Email + Password + RC Code) per class.
    const withCredentials = new URL(_request.url).searchParams.get('with_credentials') === '1';
    if (withCredentials) {
      const emails = [...new Set(
        [...students, ...formerStudents]
          .map((s: any) => String(s.email || '').trim().toLowerCase())
          .filter(Boolean),
      )];
      if (emails.length > 0) {
        const { data: credRows } = await admin
          .from('registration_results')
          .select('email, password, created_at')
          .in('email', emails)
          .order('created_at', { ascending: false });
        const passByEmail = new Map<string, string>();
        for (const row of credRows ?? []) {
          const em = String((row as any).email || '').trim().toLowerCase();
          const pw = String((row as any).password || '').trim();
          if (em && pw && !passByEmail.has(em)) passByEmail.set(em, pw);
        }
        const attachCred = (s: any) => ({
          ...s,
          temp_password: passByEmail.get(String(s.email || '').trim().toLowerCase()) ?? null,
        });
        students = students.map(attachCred);
        formerStudents = formerStudents.map(attachCred);
      }
    }

    // ── Sync current_students count from DB (not from local array) ───────────
    const actualCount = liveCountResult.count ?? students.length;
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

// POST /api/classes/[id]/students
// { action: 'normalize_credentials', studentIds?: string[], includeMissingPasswords?: boolean }
// Repairs legacy @student.rillcod.com emails to firstname123@rillcod.com + rillcod@XXXX
// and optionally provisions rillcod@XXXX passwords for students without an archived password.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await context.params;
    const admin = adminClient();
    const serverSupabase = await createServerClient();

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

    const { data: cls } = await admin
      .from('classes')
      .select('id, name, school_id')
      .eq('id', classId)
      .single();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    if (caller.role === 'school' && cls.school_id && caller.school_id !== cls.school_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (caller.role === 'teacher' && cls.school_id) {
      const { data: ts } = await admin
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id)
        .eq('school_id', cls.school_id)
        .maybeSingle();
      if (caller.school_id !== cls.school_id && !ts) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'normalize_credentials' && body?.action !== 'sync_class_logins') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }
    const targetIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds : [];
    const includeMissingPasswords = body?.includeMissingPasswords === true;
    const syncAllAuthPasswords = body?.action === 'sync_class_logins';

    let q = admin
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name')
      .eq('class_id', classId)
      .eq('role', 'student')
      .or('is_deleted.eq.false,is_deleted.is.null');
    if (targetIds.length > 0) q = q.in('id', targetIds);
    const { data: classStudents } = await q;

    const candidates = (classStudents ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      school_id: string | null;
      school_name: string | null;
    }>;

    // Check which students already have archived credentials (newest first)
    const existingEmails = candidates.map((s) => String(s.email || '').trim().toLowerCase()).filter(Boolean);
    const { data: existingCreds } = existingEmails.length > 0
      ? await admin
          .from('registration_results')
          .select('email, password, created_at')
          .in('email', existingEmails)
          .order('created_at', { ascending: false })
      : { data: [] as any[] };
    const archivedPassByEmail = new Map<string, string>();
    for (const r of existingCreds ?? []) {
      const em = String(r.email || '').trim().toLowerCase();
      const pw = String(r.password || '').trim();
      if (em && pw && !archivedPassByEmail.has(em)) {
        archivedPassByEmail.set(em, pw);
      }
    }

    const fixed: Array<{ id: string; full_name: string; old_email: string; email: string; password: string }> = [];
    const errors: Array<{ id: string; full_name: string; error: string }> = [];

    for (const stu of candidates) {
      const oldEmail = String(stu.email || '').trim().toLowerCase();
      const hasLegacyEmail = oldEmail.endsWith('@student.rillcod.com');
      const existingArchivedPw = archivedPassByEmail.get(oldEmail) || '';
      const needsPass = includeMissingPasswords && !existingArchivedPw;
      if (!syncAllAuthPasswords && !hasLegacyEmail && !needsPass) continue;

      const fullName = (stu.full_name || 'Student').trim();
      let newEmail = oldEmail;
      if (hasLegacyEmail) {
        const firstNamePart = (fullName.split(/\s+/)[0] || 'student')
          .toLowerCase()
          .replace(/[^a-z]/g, '')
          .slice(0, 18) || 'student';
        let chosen = '';
        for (let attempt = 0; attempt < 6; attempt++) {
          const digits = 100 + Math.floor(Math.random() * 900);
          const candidate = `${firstNamePart}${digits}@rillcod.com`;
          const { data: taken } = await admin.from('portal_users').select('id').eq('email', candidate).maybeSingle();
          if (!taken) {
            chosen = candidate;
            break;
          }
        }
        newEmail = chosen || `${firstNamePart}${1000 + Math.floor(Math.random() * 9000)}@rillcod.com`;
      }

      // When syncing existing logins, reuse their archived password so printed sheets immediately work!
      const newPassword = (syncAllAuthPasswords && !hasLegacyEmail && existingArchivedPw.length >= 6)
        ? existingArchivedPw
        : generateTempPassword();
      let authErrMsg: string | null = null;
      const { error: authUpdateErr } = await admin.auth.admin.updateUserById(stu.id, {
        ...(newEmail ? { email: newEmail } : {}),
        password: newPassword,
        email_confirm: true,
        ban_duration: 'none',
      });
      if (authUpdateErr) {
        // Auto-heal orphaned portal_users rows whose auth.users record is missing
        if (/not found/i.test(authUpdateErr.message || '') && newEmail) {
          const { error: recreateErr } = await admin.auth.admin.createUser({
            id: stu.id,
            email: newEmail,
            password: newPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName, role: 'student' },
          });
          if (recreateErr) authErrMsg = recreateErr.message;
        } else {
          authErrMsg = authUpdateErr.message;
        }
      }
      if (authErrMsg) {
        errors.push({ id: stu.id, full_name: fullName, error: authErrMsg });
        continue;
      }

      await admin
        .from('portal_users')
        .update({ is_active: true, ...(newEmail ? { email: newEmail } : {}) })
        .eq('id', stu.id);
      if (hasLegacyEmail) {
        await admin.from('students').update({ student_email: newEmail }).eq('user_id', stu.id);
      }

      await archivePortalCredential(admin as any, {
        schoolId: stu.school_id ?? cls.school_id ?? null,
        schoolName: stu.school_name ?? null,
        fullName,
        email: newEmail,
        password: newPassword,
        className: cls.name,
        batchLabel: `Class Roster · ${cls.name}`,
        status: 'created',
      });

      fixed.push({ id: stu.id, full_name: fullName, old_email: oldEmail, email: newEmail, password: newPassword });
    }

    return NextResponse.json({
      success: true,
      fixed_count: fixed.length,
      fixed,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
