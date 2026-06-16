import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';

/**
 * Shared Summer-School onboarding — the SINGLE source of truth for turning a
 * paid `prospective_students` record into real portal accounts.
 *
 * Why this exists: three separate code paths used to onboard summer students
 * (the Paystack webhook, the `ensure-onboarded` fallback, and manual approval),
 * each inlining slightly different logic. They all created ONE account using the
 * parent's email as the student login — which collides when the parent also has
 * (or later gets) their own parent account, and leaves the student with no
 * distinct identity. Centralising fixes that and guarantees identical behaviour.
 *
 * What it guarantees, idempotently:
 *   • A PARENT portal account (role 'parent') keyed on the parent's email.
 *   • A STUDENT portal account (role 'student') on a distinct generated login
 *     (`mike123@rillcod.com` style — first name + digits) so it never collides with the parent.
 *   • A `students` row linked to the student auth id, attached to the online school.
 *   • An explicit `parent_student_links` row (supports Rillcod's multi-child model).
 *   • A default flagship enrolment so the student dashboard isn't empty.
 *   • Archived student credentials in `registration_results` for staff resend.
 *
 * It does NOT send notifications itself — it returns the credentials so the
 * caller can deliver them (and any payment receipt) once, avoiding double-sends.
 */

type AnySupabase = SupabaseClient<any>;

export interface ProspectLike {
  id: string;
  full_name: string;
  email?: string | null;
  parent_email?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  grade?: string | null;
  age?: number | null;
  gender?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  course_interest?: string | null;
  preferred_schedule?: string | null;
  notes?: string | null;
}

export interface OnboardedAccount {
  id: string;
  email: string;
  /** Temp password — null when the account already existed and we did not reset it. */
  password: string | null;
  created: boolean;
}

export interface SummerOnboardResult {
  parent: OnboardedAccount | null;
  student: OnboardedAccount & { studentRowId: string | null };
  schoolId: string;
  schoolName: string;
  whatsappOptIn: boolean;
  parentPhone: string | null;
}

function tempPassword(): string {
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

function parseFlag(notes: string | null | undefined, label: RegExp): string | null {
  const m = (notes || '').match(label);
  return m ? m[1].trim() : null;
}

/** Find an auth user id by email (used when createUser reports "already registered"). */
async function findAuthUserId(admin: AnySupabase, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email?.trim().toLowerCase() === email)?.id ?? null;
}

const SUMMER_CLASS_NAME = 'Summer School 2026';

/**
 * Ensure the school has a "Summer School 2026" class so students are operational
 * for attendance / timetable / roster (all of which are class-driven). The class's
 * `teacher_id` is the student's tutor — we auto-pick the first teacher linked to the
 * school (junction table first, then `portal_users`); if none exists yet the class is
 * created with no tutor so an admin can assign one later. Idempotent (keyed on
 * school_id + class name); back-fills a tutor onto an existing class if one is found.
 * Returns the class id (or null if creation failed).
 */
export async function ensureSummerClassWithTutor(admin: AnySupabase, schoolId: string, schoolName: string): Promise<string | null> {
  // Resolve a tutor: a teacher linked to this school.
  let tutorId: string | null = null;
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('teacher_id')
    .eq('school_id', schoolId)
    .limit(1)
    .maybeSingle();
  tutorId = (ts as any)?.teacher_id ?? null;
  if (!tutorId) {
    const { data: t } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = (t as any)?.id ?? null;
  }

  // Fallback: assign any existing tutor/teacher from the database
  if (!tutorId) {
    const { data: tGlobal } = await admin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    tutorId = (tGlobal as any)?.id ?? null;

    if (tutorId && schoolId) {
      // Auto-assign/link the tutor to this school in teacher_schools
      await admin.from('teacher_schools').insert({
        teacher_id: tutorId,
        school_id: schoolId,
      });
    }
  }

  const { data: existing } = await admin
    .from('classes')
    .select('id, teacher_id')
    .eq('school_id', schoolId)
    .eq('name', SUMMER_CLASS_NAME)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.teacher_id && tutorId) {
      await admin.from('classes').update({ teacher_id: tutorId, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await admin
    .from('classes')
    .insert({
      name: SUMMER_CLASS_NAME,
      school_id: schoolId,
      teacher_id: tutorId,
      status: 'active',
      description: `${schoolName} — AI Summer School 2026 cohort`,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[onboardSummerStudent] ensure class failed:', error.message);
    return null;
  }
  return created?.id ?? null;
}

export async function onboardSummerStudent(
  admin: AnySupabase,
  prospect: ProspectLike,
  opts: { approvedBy?: string | null } = {},
): Promise<SummerOnboardResult> {
  // ── Consent / contact context ──
  const whatsappOptIn = /\[WhatsApp Opt-in:\s*Yes\]/i.test(prospect.notes || '');
  const studentPhone = parseFlag(prospect.notes, /\[Student Phone:\s*([^\]]+)\]/i);
  const parentPhone = studentPhone || prospect.parent_phone || null;
  const parentName = prospect.parent_name || 'Parent/Guardian';
  const normalizedParentEmail = (prospect.parent_email || prospect.email || '').trim().toLowerCase();

  // ── 1. School ──
  const school = await resolveOnlineSchool(admin, { id: prospect.school_id, name: prospect.school_name });

  // ── 1b. Class + tutor — so the student is operational for attendance/timetable/roster ──
  const classId = await ensureSummerClassWithTutor(admin, school.id, school.name);

  // ── 2. Parent account (only if we have a parent email) ──
  let parent: OnboardedAccount | null = null;
  if (normalizedParentEmail) {
    const { data: existingParent } = await admin
      .from('portal_users')
      .select('id, email')
      .eq('email', normalizedParentEmail)
      .maybeSingle();

    if (existingParent) {
      parent = { id: existingParent.id, email: normalizedParentEmail, password: null, created: false };
      // Keep WhatsApp opt-in fresh if they opted in this time.
      if (whatsappOptIn) {
        await admin.from('portal_users').update({ whatsapp_opt_in: true, phone: parentPhone }).eq('id', existingParent.id);
      }
    } else {
      const pw = tempPassword();
      let parentId: string | null = null;
      const { data: created, error } = await admin.auth.admin.createUser({
        email: normalizedParentEmail,
        password: pw,
        email_confirm: true,
        user_metadata: { full_name: parentName, role: 'parent' },
      });
      if (error) {
        parentId = await findAuthUserId(admin, normalizedParentEmail);
        if (parentId) await admin.auth.admin.updateUserById(parentId, { password: pw, user_metadata: { full_name: parentName, role: 'parent' } });
      } else {
        parentId = created?.user?.id ?? null;
      }
      if (parentId) {
        await admin.from('portal_users').upsert({
          id: parentId,
          email: normalizedParentEmail,
          full_name: parentName,
          role: 'parent',
          phone: parentPhone,
          school_id: school.id,
          school_name: school.name,
          whatsapp_opt_in: whatsappOptIn,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        parent = { id: parentId, email: normalizedParentEmail, password: pw, created: true };
      }
    }
  }

  // ── 3. Student account — distinct login in the canonical mike123@rillcod.com style.
  // Idempotency: reuse the student already provisioned for this prospect (matched by
  // parent email + name), so re-runs (webhook + fallback both fire) never create a
  // second account. The random-digit email isn't deterministic, so we key off the
  // prospect's identity instead of the generated address.
  const studentPw = tempPassword();
  let studentPortalId: string | null = null;
  let studentEmail = '';
  let studentCreated = false;

  if (normalizedParentEmail) {
    const { data: priorStudent } = await admin
      .from('students')
      .select('id, user_id, student_email')
      .ilike('parent_email', normalizedParentEmail)
      .eq('full_name', prospect.full_name)
      .eq('enrollment_type', 'summer_school')
      .maybeSingle();
    if (priorStudent?.user_id) {
      studentPortalId = priorStudent.user_id;
      studentEmail = (priorStudent.student_email || '').trim().toLowerCase();
    }
  }

  if (studentPortalId) {
    // Reuse the existing student account — refresh password + metadata.
    if (!studentEmail) {
      const { data: pu } = await admin.from('portal_users').select('email').eq('id', studentPortalId).maybeSingle();
      studentEmail = (pu?.email || await generateUniqueStudentLoginEmail(admin, prospect.full_name)).toLowerCase();
    }
    await admin.auth.admin.updateUserById(studentPortalId, {
      password: studentPw,
      user_metadata: { full_name: prospect.full_name, role: 'student' },
    });
  } else {
    studentEmail = await generateUniqueStudentLoginEmail(admin, prospect.full_name);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: studentEmail,
      password: studentPw,
      email_confirm: true,
      user_metadata: { full_name: prospect.full_name, role: 'student' },
    });
    if (error) {
      studentPortalId = await findAuthUserId(admin, studentEmail);
      if (studentPortalId) await admin.auth.admin.updateUserById(studentPortalId, { password: studentPw, user_metadata: { full_name: prospect.full_name, role: 'student' } });
    } else {
      studentPortalId = created?.user?.id ?? null;
      studentCreated = true;
    }
  }

  if (!studentPortalId) {
    throw new Error('Failed to create or resolve the student portal account');
  }

  await admin.from('portal_users').upsert({
    id: studentPortalId,
    email: studentEmail,
    full_name: prospect.full_name,
    role: 'student',
    school_id: school.id,
    school_name: school.name,
    class_id: classId,
    date_of_birth: prospect.age ? `${new Date().getFullYear() - prospect.age}-01-01` : null,
    section_class: prospect.grade || null,
    enrollment_type: 'summer_school',
    phone: studentPhone,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // ── 4. students row ──
  const studentPayload: Record<string, unknown> = {
    full_name: prospect.full_name,
    name: prospect.full_name,
    email: studentEmail,
    student_email: studentEmail,
    parent_name: parentName,
    parent_email: normalizedParentEmail || null,
    parent_phone: parentPhone,
    phone: studentPhone,
    age: prospect.age ?? null,
    gender: prospect.gender ?? null,
    grade: prospect.grade ?? null,
    grade_level: prospect.grade ?? null,
    current_class: prospect.grade ?? null,
    school_id: school.id,
    school_name: school.name,
    course_interest: prospect.course_interest || 'Summer School 2026',
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: 'summer_school',
    status: 'approved',
    is_active: true,
    is_deleted: false,
    user_id: studentPortalId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(opts.approvedBy ? { approved_by: opts.approvedBy } : {}),
  };

  const { data: existingStudentRow } = await admin
    .from('students')
    .select('id')
    .eq('user_id', studentPortalId)
    .maybeSingle();

  let studentRowId: string | null = existingStudentRow?.id ?? null;
  if (existingStudentRow) {
    const { error: updateErr } = await admin.from('students').update(studentPayload).eq('id', existingStudentRow.id);
    if (updateErr) {
      console.error('[onboardSummerStudent] Failed to update students row:', updateErr.message);
      throw new Error(`Failed to update student record: ${updateErr.message}`);
    }
  } else {
    const { data: insertedStudent, error: insertErr } = await admin
      .from('students')
      .insert({ ...studentPayload, created_at: new Date().toISOString() })
      .select('id')
      .single();
    if (insertErr) {
      console.error('[onboardSummerStudent] Failed to insert students row:', insertErr.message);
      throw new Error(`Failed to create student record: ${insertErr.message}`);
    }
    studentRowId = insertedStudent?.id ?? null;
  }

  // ── 5. Link parent ↔ student (multi-child model) ──
  if (parent && studentRowId) {
    try {
      await syncExplicitParentStudentLink(admin, parent.id, studentRowId);
    } catch (err) {
      console.error('[onboardSummerStudent] parent-student link failed:', err);
    }
  }

  // ── 6. Real learning path ──
  void ensureDefaultEnrollment(admin, studentPortalId, { grade: prospect.grade, enrollmentType: 'summer_school' });

  // ── 7. Archive student credentials for staff resend ──
  try {
    const batchName = 'Summer School 2026 — Auto-Onboard';
    const { data: existingBatch } = await admin
      .from('registration_batches')
      .select('id, student_count')
      .eq('school_id', school.id)
      .eq('class_name', batchName)
      .maybeSingle();
    let batchId = existingBatch?.id as string | undefined;
    if (!existingBatch) {
      batchId = crypto.randomUUID();
      await admin.from('registration_batches').insert({
        id: batchId,
        school_id: school.id,
        school_name: school.name,
        class_name: batchName,
        student_count: 1,
      });
    } else if (batchId) {
      await admin.from('registration_batches')
        .update({ student_count: (existingBatch.student_count ?? 0) + 1 })
        .eq('id', batchId);
    }
    if (batchId) {
      await admin.from('registration_results').insert({
        batch_id: batchId,
        full_name: prospect.full_name,
        email: studentEmail,
        password: studentPw,
        class_name: prospect.grade || null,
        status: 'sent',
      });
    }
  } catch (archiveErr) {
    console.error('[onboardSummerStudent] credential archive failed:', archiveErr);
  }

  return {
    parent,
    student: { id: studentPortalId, studentRowId, email: studentEmail, password: studentPw, created: studentCreated },
    schoolId: school.id,
    schoolName: school.name,
    whatsappOptIn,
    parentPhone,
  };
}

/**
 * Deliver onboarding credentials to the parent (email always; WhatsApp when
 * opted-in). Includes the parent portal login ONLY when the parent account was
 * newly created (so we never re-leak a returning parent's password), and always
 * includes the student login. Non-throwing.
 */
export async function sendSummerCredentials(
  result: SummerOnboardResult,
  prospect: ProspectLike,
): Promise<{ email: boolean; whatsapp: boolean }> {
  const sent = { email: false, whatsapp: false };
  const to = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const parentName = prospect.parent_name || 'Parent/Guardian';

  const parentBlock = result.parent?.created && result.parent.password
    ? `<div style="margin:16px 0;padding:15px;background:#141618;border:1px solid #2a2d33;border-radius:8px;">
         <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Parent Portal Login</p>
         <p style="margin:6px 0;font-size:14px;color:#fff;font-family:monospace;"><strong>Email:</strong> ${result.parent.email}</p>
         <p style="margin:6px 0;font-size:14px;color:#f59e0b;font-family:monospace;"><strong>Temporary Password:</strong> ${result.parent.password}</p>
         <p style="margin:8px 0 0;font-size:11px;color:#71717a;">Track your child's progress, reports and payments at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a>.</p>
       </div>`
    : '';

  const studentBlock = `<div style="margin:16px 0;padding:15px;background:#141618;border:1px solid #2a2d33;border-radius:8px;">
       <p style="margin:0 0 8px;font-size:11px;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Student Portal Login</p>
       <p style="margin:6px 0;font-size:14px;color:#fff;font-family:monospace;"><strong>Email:</strong> ${result.student.email}</p>
       <p style="margin:6px 0;font-size:14px;color:#f59e0b;font-family:monospace;"><strong>Temporary Password:</strong> ${result.student.password}</p>
       <p style="margin:8px 0 0;font-size:11px;color:#71717a;">Your child logs in to lessons, assignments and the playground at <a href="${appUrl}/login" style="color:#7c3aed;">${appUrl}/login</a>.</p>
     </div>`;

  // ── Email ──
  if (to) {
    try {
      const { notificationsService } = await import('@/services/notifications.service');
      const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
      const html = buildRillcodTransactionalEmailHtml({
        eyebrow: 'Admissions',
        title: 'Your Summer School Accounts Are Ready',
        bodyHtml: `<p style="margin:0 0 10px;">Dear ${parentName}, your child's enrolment in the Rillcod AI Summer School 2026 is confirmed.</p>
          <p style="margin:0 0 6px;">We have set up the portal accounts below. Please change the temporary passwords after first login and keep these details private.</p>
          ${parentBlock}${studentBlock}`,
        summaryRows: [
          { label: 'Student', value: prospect.full_name },
          { label: 'School', value: result.schoolName },
          { label: 'Programme', value: 'AI Summer School 2026' },
        ],
        footerNote: 'rillcod technologies limited • summer school admissions',
      });
      await notificationsService.sendExternalEmail({
        to,
        subject: 'Your Rillcod Summer School Accounts & Login Details',
        html,
        fromName: 'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
      });
      sent.email = true;
    } catch (err) {
      console.error('[sendSummerCredentials] email failed:', err);
    }
  }

  // ── WhatsApp (opt-in only) ──
  if (result.whatsappOptIn && result.parentPhone) {
    try {
      const { sendWhatsApp } = await import('@/lib/whatsapp/send');
      const lines = [
        `Hello ${parentName}! 👋`,
        `${prospect.full_name}'s Rillcod Summer School accounts are ready.`,
        '',
      ];
      if (result.parent?.created && result.parent.password) {
        lines.push('👨‍👩‍👧 Parent Portal', `Email: ${result.parent.email}`, `Password: ${result.parent.password}`, '');
      }
      lines.push('🎓 Student Portal', `Email: ${result.student.email}`, `Password: ${result.student.password}`, '', `Log in: ${appUrl}/login`, 'Please change the passwords after first login.');
      const ok = await sendWhatsApp(result.parentPhone, lines.join('\n'));
      sent.whatsapp = ok;
    } catch (err) {
      console.error('[sendSummerCredentials] whatsapp failed:', err);
    }
  }

  return sent;
}
