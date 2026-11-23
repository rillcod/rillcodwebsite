import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { cleanStudentName } from '@/lib/students/clean-name';
import { cleanGrade, canonicalGrade } from '@/lib/classes/naming';
import { findOrCreateStudentPortal } from '@/lib/students/provision';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { currentAcademicPeriod } from '@/lib/reports/coverage';
import { defaultRosterBillingPayload } from '@/lib/rosters/billing-sync';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizePhoneInput(raw?: string | null): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return '';
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }
  if (digits.length === 10 && /^[789]/.test(digits)) {
    return `+234${digits}`;
  }
  if (digits.startsWith('234') && digits.length >= 13) {
    return `+${digits}`;
  }
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function buildLoginEmailFromName(fullName: string): string {
  const first = fullName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)[0] || 'student';
  const slug = first.slice(0, 14);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${slug}${rand}@rillcod.com`;
}

async function syncClassActiveCount(admin: ReturnType<typeof adminClient>, classId: string) {
  const { count } = await admin
    .from('portal_users')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('role', 'student')
    .neq('is_active', false)
    .neq('is_deleted', true);
  if (typeof count === 'number') {
    await admin.from('classes').update({ current_students: count }).eq('id', classId);
  }
}

async function authorizeStaffForClass(classId: string) {
  const admin = adminClient();
  const serverSupabase = await createServerClient();
  const { data: { user }, error: authErr } = await serverSupabase.auth.getUser();
  if (authErr || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: caller } = await admin
    .from('portal_users')
    .select('role, id, school_id, full_name')
    .eq('id', user.id)
    .single();

  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
    return { error: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
  }

  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, school_id, program_id, term_id, qa_grade_key, qa_grade_band')
    .eq('id', classId)
    .single();

  if (clsErr || !cls) {
    return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };
  }

  if (caller.role === 'school' && cls.school_id && caller.school_id !== cls.school_id) {
    return { error: NextResponse.json({ error: 'Class is outside your school scope' }, { status: 403 }) };
  }
  if (caller.role === 'teacher' && cls.school_id) {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', cls.school_id)
      .maybeSingle();
    if (caller.school_id !== cls.school_id && !ts) {
      return { error: NextResponse.json({ error: 'You are not assigned to this class school' }, { status: 403 }) };
    }
  }

  let schoolName: string | null = null;
  if (cls.school_id) {
    const { data: school } = await admin
      .from('schools')
      .select('name')
      .eq('id', cls.school_id)
      .maybeSingle();
    schoolName = school?.name ?? null;
  }

  return { admin, caller, cls, schoolName };
}

/**
 * POST /api/classes/[id]/intake
 * Unified endpoint for both Teachers and Admins:
 *  1. action: 'intake_add' — Digital first-day / pass-around class intake (optional parent phone).
 *  2. action: 'cohort_hygiene' — Cleanly separate old vs new session students:
 *     'confirm_current' | 'archive_old' | 'promote_to_class'
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await context.params;
    const auth = await authorizeStaffForClass(classId);
    if ('error' in auth) return auth.error;
    const { admin, caller, cls, schoolName } = auth;

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();
    const period = currentAcademicPeriod();
    const currentSession = period.periodLabel;
    const nowIso = new Date().toISOString();

    // ── 1. Digital Class Intake Add ─────────────────────────────────────────
    if (action === 'intake_add') {
      const cleanedName = cleanStudentName(String(body?.full_name || ''));
      if (!cleanedName || cleanedName.length < 2) {
        return NextResponse.json({ error: 'Please enter the student full name.' }, { status: 400 });
      }
      const rawGrade = String(body?.grade || cls.qa_grade_key || '').trim();
      const resolvedGrade = cleanGrade(rawGrade) || canonicalGrade(cls.qa_grade_key || cls.name) || rawGrade || null;
      const parentPhone = normalizePhoneInput(body?.parent_phone);

      // Check if student with same normalized name already exists in this class
      const { data: existingInClass } = await admin
        .from('portal_users')
        .select('id, full_name, email, grade, metadata')
        .eq('class_id', classId)
        .eq('role', 'student')
        .ilike('full_name', cleanedName)
        .maybeSingle();

      let studentId: string;
      let studentEmail: string;
      let created = false;
      let existingMeta: Record<string, any> = {};

      if (existingInClass) {
        studentId = existingInClass.id;
        studentEmail = existingInClass.email;
        existingMeta = (existingInClass.metadata && typeof existingInClass.metadata === 'object'
          ? existingInClass.metadata
          : {}) as Record<string, any>;
      } else {
        // Also check if an unassigned/archived student with the same name exists in this school
        let existingInSchool: any = null;
        if (cls.school_id) {
          const { data } = await admin
            .from('portal_users')
            .select('id, full_name, email, grade, class_id, metadata')
            .eq('school_id', cls.school_id)
            .eq('role', 'student')
            .ilike('full_name', cleanedName)
            .is('class_id', null)
            .maybeSingle();
          existingInSchool = data;
        }

        if (existingInSchool) {
          studentId = existingInSchool.id;
          studentEmail = existingInSchool.email;
          existingMeta = (existingInSchool.metadata && typeof existingInSchool.metadata === 'object'
            ? existingInSchool.metadata
            : {}) as Record<string, any>;
        } else {
          const email = buildLoginEmailFromName(cleanedName);
          const provisioned = await findOrCreateStudentPortal(admin, {
            email,
            fullName: cleanedName,
            schoolId: cls.school_id,
            schoolName,
            classId,
            sectionClass: cls.name,
            grade: resolvedGrade,
            passwordPolicy: 'set',
            archiveCredentials: true,
            batchLabel: `class-intake-${currentSession}`,
            classNameForArchive: cls.name,
          });
          if (!provisioned.ok || !provisioned.studentId) {
            return NextResponse.json(
              { error: provisioned.error || 'Could not create student record.' },
              { status: provisioned.status || 500 },
            );
          }
          studentId = provisioned.studentId;
          studentEmail = provisioned.email || email;
          created = Boolean(provisioned.created);
        }

        // Enroll into class & activate class_term_rosters
        const reinstated = await reinstateStudentToClass(admin, {
          studentId,
          classId,
          actor: { id: caller.id, role: caller.role },
          grade: resolvedGrade,
          forceCrossTeacher: caller.role === 'admin',
        });
        if (!reinstated.ok) {
          return NextResponse.json({ error: reinstated.error }, { status: 400 });
        }
      }

      // Stamp confirmed_session + optional parent_phone on portal_users.metadata & students
      const nextMeta: Record<string, any> = {
        ...existingMeta,
        confirmed_session: currentSession,
        intake_recorded_by: caller.id,
        intake_recorded_at: nowIso,
      };
      if (parentPhone) {
        nextMeta.parent_phone = parentPhone;
        nextMeta.parent_phone_source = 'class_intake';
      }

      const portalUpdate: Record<string, any> = {
        full_name: cleanedName,
        is_active: true,
        metadata: nextMeta,
        updated_at: nowIso,
      };
      if (resolvedGrade) portalUpdate.grade = resolvedGrade;
      await admin.from('portal_users').update(portalUpdate).eq('id', studentId);

      // Sync students table row (create if missing so parent_phone & ParentClaim work seamlessly)
      const { data: existingStudentRow } = await admin
        .from('students')
        .select('id, parent_phone')
        .eq('user_id', studentId)
        .maybeSingle();

      if (existingStudentRow) {
        const studentPatch: Record<string, any> = {
          full_name: cleanedName,
          name: cleanedName,
          current_class: cls.name,
          is_active: true,
        };
        if (resolvedGrade) {
          studentPatch.grade = resolvedGrade;
          studentPatch.grade_level = resolvedGrade;
        }
        if (parentPhone) {
          studentPatch.parent_phone = parentPhone;
        }
        await admin.from('students').update(studentPatch).eq('id', existingStudentRow.id);
      } else {
        await admin.from('students').insert({
          user_id: studentId,
          name: cleanedName,
          full_name: cleanedName,
          email: studentEmail,
          school_id: cls.school_id,
          school_name: schoolName,
          current_class: cls.name,
          grade: resolvedGrade,
          grade_level: resolvedGrade,
          parent_phone: parentPhone || null,
          is_active: true,
          status: 'approved',
          payment_plan: 'school_partner',
          created_by: caller.id,
        } as any);
      }

      await syncClassActiveCount(admin, classId);

      // Auto-issue RC card non-blockingly so student is immediately result-ready
      void ensureStudentCardIssued(admin as any, {
        holderId: studentId,
        schoolId: cls.school_id,
        classId,
        actorId: caller.id,
      }).catch(() => {});

      return NextResponse.json({
        ok: true,
        created,
        student: {
          id: studentId,
          full_name: cleanedName,
          grade: resolvedGrade,
          parent_phone: parentPhone || null,
          session_status: 'confirmed_current',
        },
      });
    }

    // ── 2. Session Cohort Hygiene (Fix Old & New Mumbled Records) ───────────
    if (action === 'cohort_hygiene') {
      const operation = String(body?.operation || '').trim();
      const studentIds: string[] = Array.isArray(body?.student_ids)
        ? body.student_ids.map((v: any) => String(v)).filter(Boolean)
        : [];
      if (studentIds.length === 0) {
        return NextResponse.json({ error: 'Select at least one student.' }, { status: 400 });
      }

      const { data: targetStudents } = await admin
        .from('portal_users')
        .select('id, full_name, grade, metadata, class_id')
        .in('id', studentIds)
        .eq('role', 'student');

      const validStudents = targetStudents ?? [];
      if (validStudents.length === 0) {
        return NextResponse.json({ error: 'No matching students found.' }, { status: 404 });
      }

      if (operation === 'confirm_current') {
        const billingPayload = await defaultRosterBillingPayload(admin as any, cls);
        for (const st of validStudents) {
          const meta = (st.metadata && typeof st.metadata === 'object' ? st.metadata : {}) as Record<string, any>;
          await admin
            .from('portal_users')
            .update({
              metadata: {
                ...meta,
                confirmed_session: currentSession,
                confirmed_by: caller.id,
                confirmed_at: nowIso,
              },
              updated_at: nowIso,
            })
            .eq('id', st.id);

          let lookup = (admin as any)
            .from('class_term_rosters')
            .select('id')
            .eq('class_id', classId)
            .eq('student_id', st.id)
            .limit(1);
          lookup = cls.term_id ? lookup.eq('term_id', cls.term_id) : lookup.is('term_id', null);
          const { data: existingRoster } = await lookup.maybeSingle();
          if (existingRoster?.id) {
            await (admin as any)
              .from('class_term_rosters')
              .update({ status: 'active', ended_at: null, reinstated_at: nowIso, updated_at: nowIso })
              .eq('id', existingRoster.id);
          } else {
            await (admin as any)
              .from('class_term_rosters')
              .insert({
                class_id: classId,
                student_id: st.id,
                term_id: cls.term_id ?? null,
                school_id: cls.school_id ?? null,
                program_id: cls.program_id ?? null,
                status: 'active',
                started_at: nowIso,
                created_by: caller.id,
                ...billingPayload,
              });
          }
        }
        return NextResponse.json({
          ok: true,
          operation,
          affected: validStudents.length,
          message: `Confirmed ${validStudents.length} student${validStudents.length === 1 ? '' : 's'} for ${currentSession}.`,
        });
      }

      if (operation === 'archive_old') {
        for (const st of validStudents) {
          const meta = (st.metadata && typeof st.metadata === 'object' ? st.metadata : {}) as Record<string, any>;
          await admin
            .from('portal_users')
            .update({
              class_id: null,
              is_active: false,
              metadata: {
                ...meta,
                enrollment_status: 'withdrawn',
                archived_from_class_id: classId,
                archived_from_class_name: cls.name,
                archived_at: nowIso,
                archived_by: caller.id,
                archived_session: currentSession,
              },
              updated_at: nowIso,
            })
            .eq('id', st.id);

          await admin
            .from('students')
            .update({ is_active: false })
            .eq('user_id', st.id);

          let lookup = (admin as any)
            .from('class_term_rosters')
            .select('id')
            .eq('class_id', classId)
            .eq('student_id', st.id)
            .limit(1);
          lookup = cls.term_id ? lookup.eq('term_id', cls.term_id) : lookup.is('term_id', null);
          const { data: existingRoster } = await lookup.maybeSingle();
          if (existingRoster?.id) {
            await (admin as any)
              .from('class_term_rosters')
              .update({ status: 'withdrawn', ended_at: nowIso, updated_at: nowIso })
              .eq('id', existingRoster.id);
          } else {
            await (admin as any)
              .from('class_term_rosters')
              .insert({
                class_id: classId,
                student_id: st.id,
                term_id: cls.term_id ?? null,
                school_id: cls.school_id ?? null,
                program_id: cls.program_id ?? null,
                status: 'withdrawn',
                ended_at: nowIso,
                created_by: caller.id,
              });
          }
        }
        await syncClassActiveCount(admin, classId);
        return NextResponse.json({
          ok: true,
          operation,
          affected: validStudents.length,
          message: `Archived ${validStudents.length} withdrawn/prior-session student${validStudents.length === 1 ? '' : 's'} from ${cls.name}. Active counts & reports now reflect only remaining students; archived records can be reinstated anytime.`,
        });
      }

      if (operation === 'reinstate_withdrawn') {
        let restored = 0;
        for (const st of validStudents) {
          const meta = (st.metadata && typeof st.metadata === 'object' ? st.metadata : {}) as Record<string, any>;
          await admin
            .from('portal_users')
            .update({
              is_active: true,
              metadata: {
                ...meta,
                enrollment_status: 'active',
                confirmed_session: currentSession,
                reinstated_at: nowIso,
                reinstated_by: caller.id,
              },
              updated_at: nowIso,
            })
            .eq('id', st.id);

          await admin
            .from('students')
            .update({ is_active: true, current_class: cls.name })
            .eq('user_id', st.id);

          const res = await reinstateStudentToClass(admin, {
            studentId: st.id,
            classId,
            actor: { id: caller.id, role: caller.role },
            grade: st.grade || canonicalGrade(cls.qa_grade_key || cls.name) || undefined,
            forceCrossTeacher: caller.role === 'admin',
          });
          if (res.ok) restored += 1;
        }
        await syncClassActiveCount(admin, classId);
        return NextResponse.json({
          ok: restored > 0,
          operation,
          affected: restored,
          message: `Reinstated ${restored} returning student${restored === 1 ? '' : 's'} back into ${cls.name} for ${currentSession}.`,
        });
      }

      if (operation === 'promote_to_class') {
        const destClassId = String(body?.destination_class_id || '').trim();
        if (!destClassId || destClassId === classId) {
          return NextResponse.json({ error: 'Choose a destination class to move students into.' }, { status: 400 });
        }
        const { data: destCls } = await admin
          .from('classes')
          .select('id, name, school_id, qa_grade_key')
          .eq('id', destClassId)
          .single();
        if (!destCls) {
          return NextResponse.json({ error: 'Destination class not found.' }, { status: 404 });
        }
        if (cls.school_id && destCls.school_id && cls.school_id !== destCls.school_id && caller.role !== 'admin') {
          return NextResponse.json({ error: 'Destination class must belong to the same school.' }, { status: 403 });
        }

        const explicitGrade = cleanGrade(String(body?.target_grade || '')) || canonicalGrade(destCls.qa_grade_key || destCls.name) || null;
        let moved = 0;
        const errors: string[] = [];

        for (const st of validStudents) {
          const res = await reinstateStudentToClass(admin, {
            studentId: st.id,
            classId: destClassId,
            actor: { id: caller.id, role: caller.role },
            grade: explicitGrade || st.grade || undefined,
            forceCrossTeacher: caller.role === 'admin',
          });
          if (!res.ok) {
            errors.push(`${st.full_name}: ${res.error}`);
            continue;
          }
          const meta = (st.metadata && typeof st.metadata === 'object' ? st.metadata : {}) as Record<string, any>;
          await admin
            .from('portal_users')
            .update({
              metadata: {
                ...meta,
                confirmed_session: currentSession,
                promoted_from_class_id: classId,
                promoted_at: nowIso,
              },
              updated_at: nowIso,
            })
            .eq('id', st.id);
          moved += 1;
        }

        await Promise.all([
          syncClassActiveCount(admin, classId),
          syncClassActiveCount(admin, destClassId),
        ]);

        return NextResponse.json({
          ok: moved > 0,
          operation,
          affected: moved,
          errors,
          message: `Moved ${moved} student${moved === 1 ? '' : 's'} to ${destCls.name}.`,
        });
      }

      return NextResponse.json({ error: 'Unsupported cohort hygiene operation.' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}

/**
 * PATCH /api/classes/[id]/intake
 * Fast inline edit of a student's Full Name, Grade, or optional Parent Phone
 * right from the Digital Class Intake Sheet.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: classId } = await context.params;
    const auth = await authorizeStaffForClass(classId);
    if ('error' in auth) return auth.error;
    const { admin, caller, cls, schoolName } = auth;

    const body = await request.json().catch(() => ({}));
    const studentId = String(body?.student_id || '').trim();
    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required.' }, { status: 400 });
    }

    const { data: portal } = await admin
      .from('portal_users')
      .select('id, full_name, email, grade, class_id, metadata')
      .eq('id', studentId)
      .eq('role', 'student')
      .single();
    if (!portal) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const currentSession = currentAcademicPeriod().periodLabel;
    const meta = (portal.metadata && typeof portal.metadata === 'object' ? portal.metadata : {}) as Record<string, any>;
    const nextMeta: Record<string, any> = {
      ...meta,
      confirmed_session: currentSession,
    };

    const portalPatch: Record<string, any> = { updated_at: nowIso };
    const studentPatch: Record<string, any> = {};

    if (typeof body.full_name === 'string' && body.full_name.trim().length >= 2) {
      const cleaned = cleanStudentName(body.full_name);
      portalPatch.full_name = cleaned;
      studentPatch.full_name = cleaned;
      studentPatch.name = cleaned;
    }
    if (typeof body.grade === 'string' && body.grade.trim()) {
      const g = cleanGrade(body.grade) || body.grade.trim();
      portalPatch.grade = g;
      studentPatch.grade = g;
      studentPatch.grade_level = g;
    }
    if (typeof body.parent_phone === 'string') {
      const normalized = normalizePhoneInput(body.parent_phone);
      nextMeta.parent_phone = normalized || null;
      if (normalized) nextMeta.parent_phone_source = 'class_intake';
      studentPatch.parent_phone = normalized || null;
    }

    portalPatch.metadata = nextMeta;
    await admin.from('portal_users').update(portalPatch).eq('id', studentId);

    const { data: studentRow } = await admin
      .from('students')
      .select('id')
      .eq('user_id', studentId)
      .maybeSingle();

    if (studentRow) {
      if (Object.keys(studentPatch).length > 0) {
        await admin.from('students').update(studentPatch).eq('id', studentRow.id);
      }
    } else {
      await admin.from('students').insert({
        user_id: studentId,
        name: portalPatch.full_name || portal.full_name,
        full_name: portalPatch.full_name || portal.full_name,
        email: portal.email,
        school_id: cls.school_id,
        school_name: schoolName,
        current_class: cls.name,
        grade: portalPatch.grade || portal.grade,
        grade_level: portalPatch.grade || portal.grade,
        parent_phone: studentPatch.parent_phone ?? null,
        status: 'approved',
        payment_plan: 'school_partner',
        created_by: caller.id,
      } as any);
    }

    return NextResponse.json({
      ok: true,
      student_id: studentId,
      parent_phone: nextMeta.parent_phone ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
