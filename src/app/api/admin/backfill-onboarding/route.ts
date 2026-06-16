/**
 * POST /api/admin/backfill-onboarding
 *
 * One-shot repair for students onboarded BEFORE the shared school-resolver +
 * auto-enrolment were introduced. Admin only. Idempotent — safe to run twice.
 *
 * It fixes three historical gaps:
 *   1. Duplicate "online" schools — repoints students & portal_users from any
 *      extra online-school rows onto a single canonical one.
 *   2. School-less students — attaches approved students with no school to the
 *      canonical online school.
 *   3. Missing learning path — enrols approved students who have no enrollment
 *      into a flagship programme so their dashboard isn't empty.
 *
 * Body: { dryRun?: boolean } — when true, reports what WOULD change without writing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveOnlineSchool, ONLINE_SCHOOL_NAME } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { ensureSummerClassWithTutor } from '@/lib/summer-school/onboard';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { Database } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    // ── Admin gate ──
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (caller?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const backfillBodySchema = z.object({
      dryRun: z.boolean().optional(),
    });

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      json = {};
    }

    const parsed = backfillBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid parameters' }, { status: 400 });
    }
    const { dryRun = false } = parsed.data;

    const report = {
      dryRun,
      canonicalSchool: null as null | { id: string; name: string },
      duplicateSchoolsMerged: [] as Array<{ id: string; name: string; studentsMoved: number; usersMoved: number }>,
      schoollessStudentsFixed: 0,
      studentsEnrolled: 0,
      enrollmentsSkipped: 0,
      summerClassesAssigned: 0,
      parentLinksCreated: 0,
      parentAccountsCreated: 0,
      legacyCollisionsSkipped: 0,
    };

    // ── 1. Canonical online school ──
    const canonical = await resolveOnlineSchool(admin);
    report.canonicalSchool = canonical;

    // ── 2. Merge any other "online" schools into the canonical one ──
    const { data: onlineSchools } = await admin
      .from('schools')
      .select('id, name')
      .ilike('name', '%online%');

    for (const dup of (onlineSchools ?? []) as Array<{ id: string; name: string }>) {
      if (dup.id === canonical.id) continue;

      const { count: studentCount } = await admin
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', dup.id);
      const { count: userCount } = await admin
        .from('portal_users')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', dup.id);

      if (!dryRun) {
        await admin.from('students')
          .update({ school_id: canonical.id, school_name: canonical.name })
          .eq('school_id', dup.id);
        await admin.from('portal_users')
          .update({ school_id: canonical.id, school_name: canonical.name })
          .eq('school_id', dup.id);
      }

      report.duplicateSchoolsMerged.push({
        id: dup.id,
        name: dup.name,
        studentsMoved: studentCount ?? 0,
        usersMoved: userCount ?? 0,
      });
    }

    // ── 3. Approved students with no school → canonical online school ──
    const { data: schoolless } = await admin
      .from('students')
      .select('id, user_id')
      .eq('status', 'approved')
      .is('school_id', null);

    for (const s of (schoolless ?? []) as Array<{ id: string; user_id: string | null }>) {
      if (!dryRun) {
        await admin.from('students')
          .update({ school_id: canonical.id, school_name: canonical.name })
          .eq('id', s.id);
        if (s.user_id) {
          await admin.from('portal_users')
            .update({ school_id: canonical.id, school_name: canonical.name })
            .eq('id', s.user_id);
        }
      }
      report.schoollessStudentsFixed++;
    }

    // ── 4. Approved students with a portal account but no enrollment → enrol ──
    const { data: approved } = await admin
      .from('students')
      .select('user_id, grade_level, current_class, enrollment_type')
      .eq('status', 'approved')
      .not('user_id', 'is', null);

    for (const s of (approved ?? []) as Array<{
      user_id: string; grade_level: string | null; current_class: string | null; enrollment_type: string | null;
    }>) {
      if (dryRun) {
        const { data: hasEnr } = await admin
          .from('enrollments')
          .select('id')
          .eq('user_id', s.user_id)
          .limit(1)
          .maybeSingle();
        if (hasEnr) report.enrollmentsSkipped++; else report.studentsEnrolled++;
        continue;
      }
      const result = await ensureDefaultEnrollment(admin, s.user_id, {
        grade: s.grade_level || s.current_class,
        enrollmentType: s.enrollment_type,
      });
      if (result.enrolled) report.studentsEnrolled++;
      else report.enrollmentsSkipped++;
    }

    // ── 5. Summer students: backfill class assignment + parent account/link ──
    const { data: summerStudents } = await admin
      .from('students')
      .select('id, user_id, full_name, parent_email, parent_name, student_email, school_id, school_name, grade')
      .eq('enrollment_type', 'summer_school')
      .eq('status', 'approved')
      .or('is_deleted.is.null,is_deleted.eq.false');

    // Cache class id per school so we don't re-create/query repeatedly.
    const classBySchool = new Map<string, string | null>();

    for (const s of (summerStudents ?? []) as Array<{
      id: string; user_id: string | null; full_name: string | null; parent_email: string | null;
      parent_name: string | null; student_email: string | null; school_id: string | null;
      school_name: string | null; grade: string | null;
    }>) {
      const schoolId = s.school_id || canonical.id;
      const schoolName = s.school_name || canonical.name;

      // 5a. Class assignment (only when missing).
      let hasClass = false;
      if (s.user_id) {
        const { data: pu } = await admin
          .from('portal_users')
          .select('class_id')
          .eq('id', s.user_id)
          .maybeSingle();
        if (pu?.class_id) {
          hasClass = true;
        }
      }

      if (!hasClass) {
        if (dryRun) {
          report.summerClassesAssigned++;
        } else {
          let classId = classBySchool.get(schoolId);
          if (classId === undefined) {
            classId = await ensureSummerClassWithTutor(admin, schoolId, schoolName);
            classBySchool.set(schoolId, classId);
          }
          if (classId) {
            // Note: class_id is not a column on the students table (only on portal_users)
            if (s.user_id) await admin.from('portal_users').update({ class_id: classId }).eq('id', s.user_id);
            report.summerClassesAssigned++;
          }
        }
      }

      // 5b. Parent account + link. Only when a parent email exists AND it isn't the
      // student's own login (legacy single-account students share the email — those
      // need a full re-onboard, so we skip and count them instead of risking a split).
      const parentEmail = (s.parent_email || '').trim().toLowerCase();
      const studentLogin = (s.student_email || '').trim().toLowerCase();
      if (parentEmail && parentEmail !== studentLogin) {
        const { data: existingParent } = await admin
          .from('portal_users')
          .select('id, role')
          .eq('email', parentEmail)
          .maybeSingle();

        // If the email already belongs to a non-parent (e.g. a student) account, skip.
        if (existingParent && existingParent.role !== 'parent') {
          report.legacyCollisionsSkipped++;
          continue;
        }

        if (dryRun) {
          if (!existingParent) report.parentAccountsCreated++;
          report.parentLinksCreated++;
          continue;
        }

        let parentId: string | null = existingParent?.id ?? null;
        if (!parentId) {
          // Create a parent portal account (no email sent here — admin uses
          // Resend Credentials to deliver a fresh password to both parties).
          const cryptoMod = await import('crypto');
          const pw = cryptoMod.randomBytes(8).toString('base64url').slice(0, 10);
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: parentEmail,
            password: pw,
            email_confirm: true,
            user_metadata: { full_name: s.parent_name || 'Parent/Guardian', role: 'parent' },
          });
          parentId = created?.user?.id ?? null;
          if (createErr && !parentId) {
            const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
            parentId = list?.users?.find((u) => u.email?.trim().toLowerCase() === parentEmail)?.id ?? null;
          }
          if (parentId) {
            await admin.from('portal_users').upsert({
              id: parentId,
              email: parentEmail,
              full_name: s.parent_name || 'Parent/Guardian',
              role: 'parent',
              school_id: schoolId,
              school_name: schoolName,
              is_active: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
            report.parentAccountsCreated++;
          }
        }

        if (parentId) {
          try {
            await syncExplicitParentStudentLink(admin, parentId, s.id);
            report.parentLinksCreated++;
          } catch (linkErr) {
            console.error('[backfill] parent link failed:', linkErr);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: dryRun
        ? 'Dry run complete — no changes were written.'
        : 'Backfill complete.',
      canonicalSchoolName: ONLINE_SCHOOL_NAME,
      report,
    });
  } catch (err) {
    console.error('[backfill-onboarding]', err);
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
