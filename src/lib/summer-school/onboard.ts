import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink, isParentLinkConflict } from '@/lib/parents/links';
import { findOrCreateParentPortal } from '@/lib/parents/provision';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { findOrCreateStudentPortal } from '@/lib/students/provision';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { buildClassName, gradeBand, bandForGrade, bandCoversGrade, canonicalTier, type BandGranularity } from '@/lib/classes/naming';
import { SPECIAL_SOURCE } from '@/lib/registration/enrollment-types';
import { LEGACY_SUMMER_CLASS_NAME } from '@/lib/registration/programme-label';

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
  classId: string;
  whatsappOptIn: boolean;
  parentPhone: string | null;
}

function parseFlag(notes: string | null | undefined, label: RegExp): string | null {
  const m = (notes || '').match(label);
  return m ? m[1].trim() : null;
}

/** Legacy cohort name, defined once in programme-label.ts. */
const SUMMER_CLASS_NAME = LEGACY_SUMMER_CLASS_NAME;

/**
 * Ensure the school has a "Summer School 2026" class so students are operational
 * for attendance / timetable / roster (all of which are class-driven). The class's
 * `teacher_id` is the student's tutor — we auto-pick the first teacher linked to the
 * school (junction table first, then `portal_users`); if none exists yet the class is
 * created with no tutor so an admin can assign one later. Idempotent (keyed on
 * school_id + class name + academic term); back-fills a tutor onto an existing class if one is found.
 * Returns the class id (or null if creation failed).
 */
export async function ensureClassWithTutor(
  admin: AnySupabase,
  schoolId: string,
  schoolName: string,
  className: string,
  description?: string,
  gradeRange?: string | null,
  granularity?: BandGranularity,
  termId?: string | null,
): Promise<string | null> {
  // Resolve only an active teacher already assigned to this school.
  //
  // The `guard_class_primary_owner` trigger rejects the insert unless the owner is a
  // portal_users row with role 'teacher' that is active, not deleted, and attached to
  // this school. A teacher_schools row can point at ANY staff account — ONLINE SCHOOL
  // has the ADMINISTRATION admin linked ahead of the real teacher — so every candidate
  // is checked for eligibility rather than taking whichever row comes back first.
  let tutorId: string | null = null;

  // Mirrors the trigger: role 'teacher', is_active not false, is_deleted not true.
  const eligibleTeacher = (query: any) => query
    .eq('role', 'teacher')
    .not('is_active', 'is', false)
    .not('is_deleted', 'is', true);

  const { data: links } = await admin
    .from('teacher_schools')
    .select('teacher_id')
    .eq('school_id', schoolId);
  const linkedIds = ((links ?? []) as Array<{ teacher_id: string | null }>)
    .map((l) => l.teacher_id)
    .filter((id): id is string => !!id);
  if (linkedIds.length) {
    const { data: linked } = await eligibleTeacher(
      admin.from('portal_users').select('id').in('id', linkedIds),
    ).limit(1).maybeSingle();
    tutorId = (linked as any)?.id ?? null;
  }

  if (!tutorId) {
    const { data: t } = await eligibleTeacher(
      admin.from('portal_users').select('id').eq('school_id', schoolId),
    ).limit(1).maybeSingle();
    tutorId = (t as any)?.id ?? null;
  }


  // Link the teacher to the school so class membership is consistent.
  if (tutorId && schoolId) {
    const { data: hasLink } = await admin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('teacher_id', tutorId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!hasLink) {
      await admin.from('teacher_schools').insert({ teacher_id: tutorId, school_id: schoolId });
    }
  }

  // Prefer an explicit term; otherwise resolve the live calendar session so
  // First Term across years never collides when term is omitted by callers.
  let resolvedTermId = termId?.trim() || null;
  if (!resolvedTermId) {
    try {
      const { liveAcademicSession } = await import('@/lib/reports/academic-period');
      const live = liveAcademicSession();
      const { data: liveTerm } = await admin
        .from('academic_terms')
        .select('id')
        .eq('academic_year', live.periodLabel)
        .eq('term_label', live.termLabel)
        .maybeSingle();
      resolvedTermId = (liveTerm as { id?: string } | null)?.id ?? null;
    } catch {
      resolvedTermId = null;
    }
  }

  // Standard, auto-derived name: "{School} · {Programme} · {Grade Band}".
  // The band is part of identity so a school can run Basic 1-3 / Basic 4-6 / JSS 1-3 / SS 1-3
  // (or teacher-chosen single grades) side by side. Bounds are stored numerically so a grade
  // is placed into whichever class band COVERS its number, at any granularity.
  const isOnline = /online/i.test(schoolName);
  const tier = canonicalTier(className) || className || null;

  // Granularity: explicit param → the school's default → 'fixed'.
  let gran: BandGranularity = granularity ?? 'fixed';
  if (!granularity) {
    const { data: sch } = await admin.from('schools').select('default_band_granularity').eq('id', schoolId).maybeSingle();
    const d = (sch as { default_band_granularity?: string } | null)?.default_band_granularity;
    if (d === 'single' || d === 'fixed') gran = d;
  }

  const band = isOnline ? null : bandForGrade(gradeRange, gran);
  const normalizedBand = band?.label || gradeBand(gradeRange) || gradeRange || gradeBand(className);
  const standardName = isOnline
    ? buildClassName({ programme: className, online: true })
    : buildClassName({ schoolName, programme: className, range: normalizedBand });

  const { data: schoolClasses } = await admin
    .from('classes')
    .select('id, teacher_id, name, qa_grade_band, tier, band_lvl, band_low, band_high, term_id')
    .eq('school_id', schoolId);
  const classes = ((schoolClasses ?? []) as Array<{
    id: string; teacher_id: string | null; name: string; qa_grade_band?: string | null;
    tier?: string | null; band_lvl?: string | null; band_low?: number | null; band_high?: number | null;
    term_id?: string | null;
  }>).filter((c) => {
    // Never reuse a class from a different non-null session.
    if (resolvedTermId && c.term_id && c.term_id !== resolvedTermId) return false;
    return true;
  });

  // Prefer exact session matches; fall back to legacy null-term rows in the same pool.
  // The fallback has to apply when the session pool yields no NAME match, not only when
  // it is empty: a school with one term-pinned class ("… · Generative Art · Teens") and
  // the legacy cohort class ("Summer School 2026", term_id NULL) would otherwise never
  // see the legacy row and would create a duplicate on every run.
  const sameSession = resolvedTermId
    ? classes.filter((c) => c.term_id === resolvedTermId)
    : classes;
  const searchPools = sameSession.length && sameSession.length !== classes.length
    ? [sameSession, classes]
    : [sameSession.length ? sameSession : classes];

  // Within each pool: 1) a class of the SAME tier whose band covers this grade (most
  // specific wins) — this is what lets a single-grade child land in a fixed band, or vice
  // versa; 2) else the exact canonical name, or a legacy class with the same band label.
  const matchIn = (pool: typeof classes) => {
    const covering = band
      ? pool
          .filter((c) => c.tier && canonicalTier(c.tier) === tier
            && bandCoversGrade({ lvl: c.band_lvl ?? '', low: c.band_low ?? 0, high: c.band_high ?? 0 }, gradeRange))
          .sort((a, b) => ((a.band_high ?? 0) - (a.band_low ?? 0)) - ((b.band_high ?? 0) - (b.band_low ?? 0)))
      : [];
    return covering[0]
      ?? pool.find((c) => c.name === standardName || (c.name === className && (!normalizedBand || c.qa_grade_band === normalizedBand)));
  };
  let existing: (typeof classes)[number] | undefined;
  for (const pool of searchPools) {
    existing = matchIn(pool);
    if (existing) break;
  }

  if (existing?.id) {
    const patch: Record<string, unknown> = {};
    if (!existing.teacher_id && tutorId) patch.teacher_id = tutorId;
    // Backfill band/tier on a legacy class we matched by name.
    if (band && existing.band_low == null) {
      patch.tier = tier; patch.band_lvl = band.lvl; patch.band_low = band.low; patch.band_high = band.high;
      if (!existing.qa_grade_band) patch.qa_grade_band = band.label;
    }
    // Pin legacy null-term rows onto the live/selected session once.
    if (resolvedTermId && !existing.term_id) patch.term_id = resolvedTermId;
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await admin.from('classes').update(patch).eq('id', existing.id);
    }
    return existing.id;
  }

  if (!tutorId) {
    const { data: anyTeacher } = await eligibleTeacher(
      admin.from('portal_users').select('id'),
    ).limit(1).maybeSingle();
    tutorId = (anyTeacher as any)?.id ?? null;
  }

  // No admin fallback: the guard trigger requires role 'teacher', so an admin owner
  // can never be inserted — it only turned a missing-teacher case into a hard failure.
  if (!tutorId) {
    console.error('[ensureClassWithTutor] no eligible teacher exists for school', schoolId);
    return null;
  }

  // The owner must be attached to this school or the guard trigger rejects the insert.
  // A teacher borrowed from elsewhere by the fallback above has no link yet.
  const { data: ownerLink } = await admin
    .from('teacher_schools')
    .select('teacher_id')
    .eq('teacher_id', tutorId)
    .eq('school_id', schoolId)
    .maybeSingle();
  if (!ownerLink) {
    await admin.from('teacher_schools').insert({ teacher_id: tutorId, school_id: schoolId });
  }

  const { data: created, error } = await admin
    .from('classes')
    .insert({
      name: standardName,
      school_id: schoolId,
      teacher_id: tutorId || null,
      status: 'active',
      qa_grade_band: normalizedBand ?? null,
      tier: tier ?? null,
      band_lvl: band?.lvl ?? null,
      band_low: band?.low ?? null,
      band_high: band?.high ?? null,
      term_id: resolvedTermId,
      description: description ?? `${schoolName} — ${className}`,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[ensureClassWithTutor] ensure class failed:', error.message);
    return null;
  }
  return created?.id ?? null;
}

/**
 * The one live duration-programme offering for this school.
 *
 * Exactly one can be active per programme per school — enforced by
 * uq_active_duration_offering_per_programme_school — so this either finds the
 * cohort's offering or finds nothing, never a choice between duplicates.
 */
async function activeDurationOffering(
  admin: AnySupabase,
  schoolId: string,
): Promise<{ id: string; period_id: string | null } | null> {
  const { data: offering } = await admin
    .from('academic_offerings')
    .select('id')
    .eq('school_id', schoolId)
    .eq('academic_model', 'duration_programme')
    .eq('status', 'active')
    .maybeSingle();
  if (!offering?.id) return null;

  const { data: period } = await admin
    .from('academic_offering_periods')
    .select('id')
    .eq('offering_id', offering.id)
    .order('sequence_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  return { id: offering.id as string, period_id: (period?.id as string) ?? null };
}

/**
 * Summer-school cohort class wrapper.
 *
 * Attaches the class to its programme's offering. Without this the cohort class
 * was created with a school term and no offering at all, so registrants landed
 * off the programme they had just paid for — which is how Summer School 2026
 * ended up with its money on one offering and its learners on two others.
 */
export async function ensureSummerClassWithTutor(admin: AnySupabase, schoolId: string, schoolName: string): Promise<string | null> {
  const classId = await ensureClassWithTutor(
    admin,
    schoolId,
    schoolName,
    SUMMER_CLASS_NAME,
    `${schoolName} — ${SUMMER_CLASS_NAME} cohort`,
  );
  if (!classId) return null;

  const offering = await activeDurationOffering(admin, schoolId);
  if (offering) {
    // term_id is cleared by keep_duration_classes_off_the_term_spine once the
    // offering lands, so a duration cohort never carries a school term.
    const { error } = await admin
      .from('classes')
      .update({
        academic_offering_id: offering.id,
        offering_period_id: offering.period_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classId);
    if (error) {
      console.error('[ensureSummerClassWithTutor] could not attach offering:', error.message);
    }
  } else {
    console.error(
      '[ensureSummerClassWithTutor] no active duration offering for school',
      schoolId,
      '— cohort class is not attached to a programme',
    );
  }

  return classId;
}

export type SpecialCohortPlacement = {
  classId: string;
  className: string;
  schoolId: string;
  schoolName: string;
  offeringId: string;
};

/**
 * Where a special-programme learner actually belongs: the cohort class on the
 * offering of the page they registered through.
 *
 * The registration stamps `[SpecialPage: <uuid>]` into the prospect's notes,
 * and `launchSpecialProgramTeaching` builds every plan, lesson and assignment
 * onto that page's cohort class. Onboarding used to ignore both and drop every
 * learner into one hardcoded "Summer School 2026" class instead — so a parent
 * who paid for a bootcamp got a child sitting in a class named after a summer
 * programme, with the bootcamp's curriculum in a class that had no roster.
 *
 * Returns null when the prospect predates the tag or the cohort class does not
 * exist yet; the caller then falls back to the legacy summer class.
 */
export async function resolveSpecialCohortPlacement(
  admin: AnySupabase,
  notes: string | null | undefined,
): Promise<SpecialCohortPlacement | null> {
  const tagged = String(notes || '').match(/\[SpecialPage:\s*([0-9a-f-]{36})\]/i);
  if (!tagged?.[1]) return null;

  const { data: page } = await admin
    .from('special_program_pages')
    .select('academic_offering_id')
    .eq('id', tagged[1])
    .maybeSingle();
  const offeringId = page?.academic_offering_id ? String(page.academic_offering_id) : null;
  if (!offeringId) return null;

  // The learner's school has to be the school teaching sits on, or the
  // guard_portal_student_class_pathway trigger rejects the placement.
  const { data: offering } = await admin
    .from('academic_offerings')
    .select('id, school_id')
    .eq('id', offeringId)
    .maybeSingle();
  const schoolId = offering?.school_id ? String(offering.school_id) : null;
  if (!schoolId) return null;

  const { data: classes } = await admin
    .from('classes')
    .select('id, name, status, created_at')
    .eq('academic_offering_id', offeringId)
    .order('created_at', { ascending: false });
  const rows = (classes ?? []) as Array<{ id: string; name: string | null; status: string | null }>;
  const cohort = rows.find((c) => c.status === 'active') ?? rows[0];
  if (!cohort?.id) return null;

  const { data: school } = await admin
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .maybeSingle();

  return {
    classId: String(cohort.id),
    className: String(cohort.name || 'Special programme cohort'),
    schoolId,
    schoolName: String((school as { name?: string } | null)?.name || ''),
    offeringId,
  };
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

  // ── 1. School + class — the cohort the learner actually paid to join ──
  //
  // Prefer the cohort class on the registration page's own offering: that is
  // where the curriculum, lessons and assignments for this programme were
  // built. Only when the prospect carries no page tag (legacy rows) do we fall
  // back to the shared summer class.
  const placement = await resolveSpecialCohortPlacement(admin, prospect.notes);

  const school = placement
    ? await resolveOnlineSchool(admin, { id: placement.schoolId, name: placement.schoolName })
    : await resolveOnlineSchool(admin, { id: prospect.school_id, name: prospect.school_name });

  const classId = placement?.classId
    ?? (await ensureSummerClassWithTutor(admin, school.id, school.name));
  if (!classId) {
    throw new Error('Could not create or resolve the cohort class for this student.');
  }
  const cohortName = placement?.className ?? SUMMER_CLASS_NAME;

  // What this learner actually bought, in their own programme's words.
  //
  // Registration stamps [Programme: <title>] into the notes, so this is known
  // for every pathway. It used to be hardcoded to "AI Summer School 2026" —
  // which meant a parent enrolling in a bootcamp received an invoice line and
  // an archived credential batch naming a summer programme they never bought.
  // A special programme is by definition the thing that changes; nothing
  // customer-facing should carry one cohort's name.
  const programmeLabel =
    parseFlag(prospect.notes, /\[Programme:\s*([^\]]+)\]/i)
    || placement?.className
    || SUMMER_CLASS_NAME;

  // ── 2. Parent account (only if we have a parent email) ──
  let parent: OnboardedAccount | null = null;
  if (normalizedParentEmail) {
    const provisioned = await findOrCreateParentPortal(admin, {
      email: normalizedParentEmail,
      fullName: parentName,
      phone: parentPhone,
      schoolId: school.id,
      schoolName: school.name,
      passwordPolicy: 'set',
      preserveExistingProfile: true,
      archiveCredentials: false,
      batchLabel: 'Summer School Parent',
    });
    if (!provisioned.ok || !provisioned.parentId) {
      throw new Error(provisioned.error || `Could not provision parent for ${normalizedParentEmail}`);
    }
    parent = {
      id: provisioned.parentId,
      email: normalizedParentEmail,
      password: provisioned.created ? (provisioned.password ?? null) : null,
      created: !!provisioned.created,
    };
    // Keep WhatsApp opt-in fresh if they opted in this time.
    if (whatsappOptIn) {
      await admin.from('portal_users').update({
        whatsapp_opt_in: true,
        phone: parentPhone,
        updated_at: new Date().toISOString(),
      }).eq('id', parent.id);
    }
  }

  // ── 3. Student account — distinct login in the canonical mike123@rillcod.com style.
  // Idempotency: reuse the student already provisioned for this prospect (matched by
  // parent email + name), so re-runs (webhook + fallback both fire) never create a
  // second account. The random-digit email isn't deterministic, so we key off the
  // prospect's identity instead of the generated address.
  let studentPortalId: string | null = null;
  let studentEmail = '';
  let studentCreated = false;
  let studentPw: string | null = null;
  let priorRowId: string | null = null;
  const fullNameTrimmed = (prospect.full_name || '').trim().replace(/\s+/g, ' ');

  if (normalizedParentEmail && fullNameTrimmed) {
    // Reuse a prior row for this parent+child so re-runs never duplicate. Match the
    // name in JS with whitespace/case normalisation — a stored trailing space made the
    // old `.ilike('full_name', trimmed)` miss, so a 15-min cron minted a new account
    // every run. Fetch this parent's rows (oldest first) and pick the matching child.
    const { data } = await admin
      .from('students')
      .select('id, user_id, student_email, full_name')
      .ilike('parent_email', normalizedParentEmail)
      .order('created_at', { ascending: true });
    const wantedName = fullNameTrimmed.toLowerCase();
    const priorStudent = (data ?? []).find(
      (s: { full_name: string | null }) => (s.full_name || '').trim().replace(/\s+/g, ' ').toLowerCase() === wantedName,
    );
    if (priorStudent) {
      priorRowId = priorStudent.id;
      if (priorStudent.user_id) {
        studentPortalId = priorStudent.user_id;
        studentEmail = (priorStudent.student_email || '').trim().toLowerCase();
      }
    }
  }

  if (studentPortalId) {
    // Reuse the existing student account — do NOT reset its password (passwordPolicy: keep).
    if (!studentEmail) {
      const { data: pu } = await admin.from('portal_users').select('email').eq('id', studentPortalId).maybeSingle();
      studentEmail = (pu?.email || await generateUniqueStudentLoginEmail(admin, prospect.full_name)).toLowerCase();
    }
  } else {
    studentEmail = await generateUniqueStudentLoginEmail(admin, prospect.full_name);
  }

  const studentProvisioned = await findOrCreateStudentPortal(admin, {
    email: studentEmail,
    fullName: prospect.full_name,
    schoolId: school.id,
    schoolName: school.name,
    classId,
    sectionClass: cohortName,
    grade: prospect.grade || null,
    passwordPolicy: studentPortalId ? 'keep' : 'set',
    existingUserId: studentPortalId,
    enrollmentType: 'special',
    gender: prospect.gender ?? null,
    dateOfBirth: prospect.age ? `${new Date().getFullYear() - prospect.age}-01-01` : null,
    phone: studentPhone,
    archiveCredentials: false,
  });
  if (!studentProvisioned.ok || !studentProvisioned.studentId) {
    throw new Error(studentProvisioned.error || 'Failed to create or resolve the student portal account');
  }
  studentPortalId = studentProvisioned.studentId;
  studentEmail = studentProvisioned.email || studentEmail;
  studentCreated = !!studentProvisioned.created;
  studentPw = studentProvisioned.password ?? null;

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
    current_class: cohortName,
    section: cohortName,
    school_id: school.id,
    school_name: school.name,
    course_interest: prospect.course_interest || programmeLabel,
    preferred_schedule: prospect.preferred_schedule ?? null,
    enrollment_type: 'special',
    status: 'approved',
    is_active: true,
    is_deleted: false,
    user_id: studentPortalId,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(opts.approvedBy ? { approved_by: opts.approvedBy } : {}),
  };

  // Prefer the prior matched row (parent + name); else the row already linked to
  // this account; else insert — one student row per child, no duplicates.
  let studentRowId: string | null = priorRowId;
  if (!studentRowId) {
    const { data: byUser } = await admin.from('students').select('id').eq('user_id', studentPortalId).limit(1);
    studentRowId = (byUser ?? [])[0]?.id ?? null;
  }
  if (studentRowId) {
    const { error: updateErr } = await admin.from('students').update(studentPayload).eq('id', studentRowId);
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
      await syncExplicitParentStudentLink(admin, parent.id, studentRowId, {
        source: 'summer-school.onboard',
      });
    } catch (err) {
      console.error('[onboardSummerStudent] parent-student link failed:', err);
      // Conflict means another parent already owns this child — surface so staff can fix.
      if (isParentLinkConflict(err)) throw err;
    }
  }

  // ── 6. Real learning path (prefer special page program_id when linked) ──
  let preferredProgramId: string | null = null;
  const specialMatch = String(prospect.notes || '').match(/\[SpecialPage:\s*([0-9a-f-]{36})\]/i);
  if (specialMatch?.[1]) {
    try {
      const { data: sp } = await admin
        .from('special_program_pages')
        .select('program_id')
        .eq('id', specialMatch[1])
        .maybeSingle();
      preferredProgramId = sp?.program_id || null;
    } catch {
      /* non-critical */
    }
  }

  const programmeEnrollment = await ensureDefaultEnrollment(admin, studentPortalId, {
    grade: prospect.grade,
    enrollmentType: 'special',
    courseInterest: prospect.course_interest,
    preferredProgramId,
  });

  if (!programmeEnrollment.enrolled && programmeEnrollment.reason !== 'already_enrolled') {
    console.warn(
      '[onboardSummerStudent] programme enrollment needs attention:',
      programmeEnrollment.reason || 'no matching programme',
    );
  }
  // ── 7. Archive credentials for staff resend (only when freshly created) ──
  try {
    const batchLabel = `${programmeLabel} — Auto-Onboard`;
    if (studentCreated && studentPw) {
      await archivePortalCredential(admin, {
        schoolId: school.id,
        schoolName: school.name,
        fullName: prospect.full_name,
        email: studentEmail,
        password: studentPw,
        className: prospect.grade || null,
        batchLabel,
        status: 'sent',
      });
    }
    if (parent?.created && parent.password) {
      await archivePortalCredential(admin, {
        schoolId: school.id,
        schoolName: school.name,
        fullName: parentName,
        email: parent.email,
        password: parent.password,
        className: 'Parent Account',
        batchLabel,
        status: 'sent',
      });
    }
  } catch (archiveErr) {
    console.error('[onboardSummerStudent] credential archive failed:', archiveErr);
  }

  // Link completed tuition payments to the admitted learner and repair any
  // missing paid invoice through the canonical settlement service.
  try {
    const { ensureSettledInvoiceForTransaction } = await import('@/lib/finance/settled-invoice');
    const { data: transactions, error: transactionLoadError } = await admin
      .from('payment_transactions')
      .select('id, amount, currency, invoice_id, payment_status, transaction_reference')
      .contains('payment_gateway_response', { prospect_id: prospect.id })
      .order('created_at', { ascending: false });
    if (transactionLoadError) throw new Error(transactionLoadError.message);

    for (const transaction of transactions ?? []) {
      const { error: ownerLinkError } = await admin.from('payment_transactions')
        .update({ portal_user_id: studentPortalId, school_id: school.id, updated_at: new Date().toISOString() })
        .eq('id', transaction.id);
      if (ownerLinkError) throw new Error(`Could not link tuition payment to learner: ${ownerLinkError.message}`);

      // An invoice raised before the learner existed has nobody on it. Linking
      // the transaction alone left it that way permanently: the money showed as
      // paid, but the invoice belonged to no learner and no school, so finance
      // reporting keyed on either could not see it. Two settled invoices worth
      // ₦70,000 were stranded that way before this backfill existed.
      if (transaction.invoice_id) {
        const { error: invoiceLinkError } = await admin
          .from('invoices')
          .update({ portal_user_id: studentPortalId, school_id: school.id, updated_at: new Date().toISOString() })
          .eq('id', transaction.invoice_id)
          .is('portal_user_id', null);
        if (invoiceLinkError) {
          console.error('[onboardSummerStudent] could not attribute existing invoice:', invoiceLinkError.message);
        }
      }

      if (['completed', 'success', 'paid'].includes(String(transaction.payment_status || '').toLowerCase()) && !transaction.invoice_id) {
        const amount = Number(transaction.amount) || 0;
        const rawReference = String(transaction.transaction_reference || transaction.id);
        const invoice = await ensureSettledInvoiceForTransaction(admin as any, {
          transactionId: transaction.id,
          invoiceNumber: `INV-SUM-${rawReference.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`,
          amount,
          currency: transaction.currency || 'NGN',
          portalUserId: studentPortalId,
          schoolId: school.id,
          items: [{
            description: `${programmeLabel} Tuition — ${prospect.full_name}`,
            quantity: 1,
            unit_price: amount,
            total: amount,
          }],
          metadata: { source: SPECIAL_SOURCE, student_name: prospect.full_name, prospect_id: prospect.id },
        });
        if (!invoice.ok) throw new Error(invoice.error.message);
      }
    }
  } catch (financeError) {
    console.error('[onboardSummerStudent] finance sync failed:', financeError);
  }
  return {
    parent,
    student: { id: studentPortalId, studentRowId, email: studentEmail, password: studentCreated ? studentPw : null, created: studentCreated },
    schoolId: school.id,
    schoolName: school.name,
    classId,
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
  opts: { activation?: boolean; force?: boolean } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { deliverSummerSchoolCredentials } = await import('@/lib/credentials/summer-school-credentials');
  const deliveryInput = {
    ...result,
    parentPhone: result.whatsappOptIn ? result.parentPhone : null,
  };
  return deliverSummerSchoolCredentials(createAdminClient(), deliveryInput, prospect, {
    ...opts,
    prospectId: prospect.id,
  });
}

/**
 * Post-approval / post-payment activation notice — always sends parent acknowledgement
 * even when both portal accounts already exist. Resets temp passwords only for
 * accounts that have never signed in.
 */
export async function sendSpecialProgramActivation(
  result: SummerOnboardResult,
  prospect: ProspectLike,
  opts: { force?: boolean } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  return sendSummerCredentials(result, prospect, { activation: true, force: opts.force });
}
