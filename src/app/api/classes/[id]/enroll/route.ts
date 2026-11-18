import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';
import { defaultRosterBillingPayload } from '@/lib/rosters/billing-sync';
import { requiresTeacherTransferRequest } from '@/lib/students/transfer-policy';
import { reinstateStudentToClass } from '@/lib/students/reinstate-to-class';
import { isPasteClaimEnabled } from '@/lib/server/app-settings';
import {
  bandCoversGrade,
  canonicalGrade,
  cleanGrade,
  parseBandLabel,
  SINGLE_GRADES,
  type CanonicalBand,
} from '@/lib/classes/naming';
import { cleanStudentName } from '@/lib/students/clean-name';
import { parseBulkGrade, stripBulkGrade } from '@/lib/students/bulk-grade';
import {
  loadSchoolStudentsForClaim,
  matchPastedNamesToStudents,
  parsePastedStudentNames,
} from '@/lib/students/claim-by-names';
import { findOrCreateStudentPortal } from '@/lib/students/provision';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';

function previousFeederGrade(gradeKey?: string | null): string | null {
  const canon = canonicalGrade(gradeKey);
  if (!canon) return null;
  const idx = (SINGLE_GRADES as readonly string[]).indexOf(canon);
  return idx > 0 ? SINGLE_GRADES[idx - 1] : null;
}

function nextHigherGrade(gradeKey?: string | null): string | null {
  const canon = canonicalGrade(gradeKey);
  if (!canon) return null;
  const idx = (SINGLE_GRADES as readonly string[]).indexOf(canon);
  return idx >= 0 && idx < SINGLE_GRADES.length - 1 ? SINGLE_GRADES[idx + 1] : null;
}

function resolveClassBand(cls?: {
  name?: string | null;
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
} | null): CanonicalBand | null {
  if (!cls) return null;
  return (
    parseBandLabel(cls.qa_grade_band)
    ?? parseBandLabel(cls.qa_grade_key)
    ?? parseBandLabel(cls.name?.includes('·') ? cls.name.split('·').pop()?.trim() : cls.name)
  );
}

/**
 * Feeder grades that naturally promote into this class at a session boundary.
 * Notably, for JSS 1 (or JSS 1-3), BOTH Basic 5 and Basic 6 are feeder grades.
 */
function feederGradesForClass(cls?: {
  name?: string | null;
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
} | null): string[] {
  const band = resolveClassBand(cls);
  const entryGrade = band
    ? `${band.lvl} ${band.low}`
    : canonicalGrade(cls?.qa_grade_key) ?? canonicalGrade(cls?.name);
  if (!entryGrade) return [];
  if (entryGrade === 'JSS 1') return ['Basic 6', 'Basic 5'];
  const prev = previousFeederGrade(entryGrade);
  return prev ? [prev] : [];
}

function resolveGradeForAction(
  action: 'promote' | 'demote' | 'retain' | string | undefined,
  currentGrade: string | null | undefined,
  clsOrGrade:
    | { name?: string | null; qa_grade_key?: string | null; qa_grade_band?: string | null }
    | string
    | null
    | undefined,
  explicitTargetGrade?: string | null,
): string | null {
  if (explicitTargetGrade?.trim()) {
    return cleanGrade(explicitTargetGrade) ?? explicitTargetGrade.trim();
  }
  // Allow passing a direct canonical grade as the action itself (e.g. "JSS 3")
  if (action && (SINGLE_GRADES as readonly string[]).includes(action.trim())) {
    return action.trim();
  }

  const clsObj = typeof clsOrGrade === 'string' ? { qa_grade_key: clsOrGrade } : clsOrGrade;
  const band = resolveClassBand(clsObj);
  const entryGrade = band
    ? `${band.lvl} ${band.low}`
    : canonicalGrade(clsObj?.qa_grade_key) ?? canonicalGrade(clsObj?.name);
  const canonCurrent = canonicalGrade(currentGrade);

  if (action === 'retain') {
    return canonCurrent ?? entryGrade ?? null;
  }
  if (action === 'demote') {
    return previousFeederGrade(canonCurrent) ?? entryGrade ?? null;
  }

  // Default / 'promote':
  if (band) {
    // 1. Single-grade class (e.g. JSS 1, JSS 3): everyone promoted/adopted into this class gets its grade
    if (band.low === band.high) {
      return band.label;
    }
    // 2. Multi-grade band class (e.g. JSS 1-3, Basic 4-6, SS 1-3):
    // Basic 5 and Basic 6 promoting into a JSS band always enter at JSS 1
    if (band.lvl === 'JSS' && (canonCurrent === 'Basic 5' || canonCurrent === 'Basic 6')) {
      return 'JSS 1';
    }
    if (band.lvl === 'SS' && canonCurrent === 'JSS 3') {
      return 'SS 1';
    }
    const stepped = nextHigherGrade(canonCurrent);
    if (stepped && bandCoversGrade(band, stepped)) {
      return stepped;
    }
    if (canonCurrent && bandCoversGrade(band, canonCurrent)) {
      return canonCurrent;
    }
    return entryGrade;
  }

  if (canonCurrent === 'Basic 5' || canonCurrent === 'Basic 6') {
    const rawName = (clsObj?.name ?? clsObj?.qa_grade_key ?? '').toLowerCase();
    if (rawName.includes('jss') || rawName.includes('teen')) return 'JSS 1';
  }

  return entryGrade ?? nextHigherGrade(canonCurrent) ?? canonCurrent ?? null;
}

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | { _err: string } | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { _err: `auth:${error?.message ?? 'no user'}` };
  const { data: caller, error: dbErr } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller) return { _err: `profile:${dbErr?.message ?? 'not found'} uid=${user.id}` };
  if (!['admin', 'teacher', 'school'].includes(caller.role)) return { _err: `role:${caller.role}` };
  return caller as Caller;
}

/**
 * Returns true if the calling staff member is allowed to manage students in the given class.
 * - admin:  always allowed
 * - school: class must belong to their school
 * - teacher: class must belong to one of their assigned schools
 */
async function callerHasClassAccess(caller: Caller, classSchoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) return true; // class has no school restriction

  if (caller.role === 'school') {
    return caller.school_id === classSchoolId;
  }

  if (caller.role === 'teacher') {
    if (caller.school_id === classSchoolId) return true;
    const { data: ts } = await adminClient()
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id)
      .eq('school_id', classSchoolId)
      .maybeSingle();
    return !!ts;
  }

  return false;
}

async function upsertClassTermRoster(
  admin: ReturnType<typeof adminClient>,
  cls: { id: string; term_id?: string | null; school_id?: string | null; program_id?: string | null },
  studentIds: string[],
  status: 'active' | 'paused' | 'withdrawn' | 'completed',
  actorId: string,
) {
  if (studentIds.length === 0) return;
  for (const studentId of studentIds) {
    let lookup = (admin as any)
      .from('class_term_rosters')
      .select('id')
      .eq('class_id', cls.id)
      .eq('student_id', studentId)
      .limit(1);
    lookup = cls.term_id ? lookup.eq('term_id', cls.term_id) : lookup.is('term_id', null);
    const { data: existing, error: lookupErr } = await lookup.maybeSingle();
    if (lookupErr?.code === '42P01') return;
    if (lookupErr) {
      console.warn('[class_term_rosters] lookup failed', lookupErr);
      continue;
    }

    const active = status === 'active';
    const billingPayload = active ? await defaultRosterBillingPayload(admin as any, cls) : {};
    const payload = {
      class_id: cls.id,
      student_id: studentId,
      term_id: cls.term_id ?? null,
      school_id: cls.school_id ?? null,
      program_id: cls.program_id ?? null,
      status,
      ended_at: active ? null : new Date().toISOString(),
      reinstated_at: active ? new Date().toISOString() : null,
      ...billingPayload,
      updated_by: actorId,
    };

    const { error } = existing?.id
      ? await (admin as any).from('class_term_rosters').update(payload).eq('id', existing.id)
      : await (admin as any).from('class_term_rosters').insert({
          ...payload,
          started_at: new Date().toISOString(),
          created_by: actorId,
        });
    if (error?.code === '42P01') return;
    if (error) console.warn('[class_term_rosters] upsert failed', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes/[id]/enroll
// Returns students eligible for this class (scoped to its school), sorted so
// unassigned students come first.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;
  const admin = adminClient();

  // Fetch the class to determine its school, grade, and term
  const { data: cls } = await admin
    .from('classes')
    .select('name, school_id, teacher_id, term_id, qa_grade_key, qa_grade_band, academic_offerings(enrollment_type)')
    .eq('id', classId)
    .single();

  // Non-admin: verify they have access to this class's school
  if (caller.role !== 'admin') {
    const hasAccess = await callerHasClassAccess(caller, cls?.school_id ?? null);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied to this class' }, { status: 403 });
    }
  }

  let query = admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, grade, class_id, primary_teacher_id, enrollment_type, is_active, classes:class_id(id, name, teacher_id, term_id, qa_grade_key)')
    .eq('role', 'student')
    .or('is_deleted.eq.false,is_deleted.is.null');

  // Emergency claim mode: include inactive / withdrawn accounts so staff can fix data.
  // Normal enroll list stays limited to active (or null) accounts.
  const claimMode = await isPasteClaimEnabled(admin);
  if (!claimMode) {
    query = query.or('is_active.eq.true,is_active.is.null') as any;
  }

  if (caller.role === 'admin') {
    // Admin sees every student — no school filter
  } else if (cls?.school_id) {
    // Scope strictly to this class's school only.
    // This is the key guard: teachers/school users can only see students from the
    // class's school, NOT from all their assigned schools. This prevents accidental
    // cross-school enrolment via the picker.
    const { data: schoolRow } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const schoolName = schoolRow?.name ?? null;

    const idPart = `school_id.eq.${cls.school_id}`;
    const namePart = schoolName
      ? `and(school_id.is.null,school_name.eq.${JSON.stringify(schoolName)})`
      : '';
    const orClause = [idPart, namePart].filter(Boolean).join(',');
    query = query.or(orClause) as any;
  } else {
    // Class has no school — non-admins see nothing (no unconstrained exposure)
    if (caller.role !== 'admin') {
      return NextResponse.json({ students: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const { data: allData, error } = await query.order('full_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ownerIds = [...new Set((allData ?? []).map((row: any) => row.classes?.teacher_id ?? row.primary_teacher_id).filter(Boolean))];
  const { data: owners } = ownerIds.length
    ? await admin.from('portal_users').select('id, full_name, email').in('id', ownerIds)
    : { data: [] as any[] };
  const ownerMap = new Map((owners ?? []).map((owner: any) => [owner.id, owner]));
  const { data: pendingRows } = caller.role === 'teacher'
    ? await admin.from('student_transfer_requests').select('id, student_id, status').eq('requested_by', caller.id).eq('to_class_id', classId).eq('status', 'pending')
    : { data: [] as any[] };
  const pendingByStudent = new Map((pendingRows ?? []).map((row: any) => [row.student_id, row.id]));

  // Exclude students already IN this class; unassigned students sort first.
  const expectedEnrollmentType = Array.isArray((cls as any)?.academic_offerings)
    ? (cls as any).academic_offerings[0]?.enrollment_type
    : (cls as any)?.academic_offerings?.enrollment_type;

  const classBand = resolveClassBand(cls as any);
  const classGrade =
    (cls as any)?.qa_grade_key
    ?? (classBand ? classBand.label : null);
  const feederGrades = feederGradesForClass(cls as any);
  const feederGrade = feederGrades[0] ?? null;
  const feederSet = new Set(feederGrades.map((g) => g.toLowerCase()));

  const students = (allData ?? [])
    .filter((u: any) => u.class_id !== classId)
    .filter((u: any) => !expectedEnrollmentType || u.enrollment_type === expectedEnrollmentType)
    .map((u: any) => {
      const currentTeacherId = u.classes?.teacher_id ?? u.primary_teacher_id ?? null;
      const studentGrade = canonicalGrade(u.grade || u.classes?.qa_grade_key || u.section_class) || (u.grade || u.classes?.qa_grade_key || '').trim();
      const fromPriorTerm = Boolean(cls?.term_id && u.classes?.term_id && u.classes.term_id !== cls.term_id);
      const isFeederPromotion = Boolean(studentGrade && feederSet.has(studentGrade.toLowerCase()));
      const isInClassBand = Boolean(classBand && studentGrade && bandCoversGrade(classBand, studentGrade));
      const isCrossGradePromotion = Boolean(classGrade && studentGrade && studentGrade.toLowerCase() !== classGrade.toLowerCase());
      const suggestedGrade = resolveGradeForAction('promote', studentGrade, cls as any);
      // Session handover: students moving up from feeder grades (including Basic 5 & Basic 6 -> JSS 1),
      // prior terms, or into this class's grade band can be adopted directly by the class teacher.
      const requiresTransfer = (fromPriorTerm || isFeederPromotion || isInClassBand || isCrossGradePromotion)
        ? false
        : requiresTeacherTransferRequest({ actorRole: caller.role, currentTeacherId, destinationTeacherId: cls?.teacher_id ?? null });
      return {
        ...u,
        grade: studentGrade || u.grade,
        suggested_grade: suggestedGrade,
        current_class_name: u.classes?.name ?? u.section_class ?? null,
        current_teacher_id: currentTeacherId,
        current_teacher_name: ownerMap.get(currentTeacherId)?.full_name ?? null,
        current_teacher_email: ownerMap.get(currentTeacherId)?.email ?? null,
        is_feeder_promotion: isFeederPromotion,
        from_prior_term: fromPriorTerm,
        requires_transfer_request: requiresTransfer,
        pending_transfer_request_id: pendingByStudent.get(u.id) ?? null,
      };
    })
    .sort((a: any, b: any) => {
      if (a.is_feeder_promotion && !b.is_feeder_promotion) return -1;
      if (!a.is_feeder_promotion && b.is_feeder_promotion) return 1;
      if (!a.class_id && b.class_id) return -1;
      if (a.class_id && !b.class_id) return 1;
      return 0;
    });

  // Build school_classes summary so teachers can select any class in the same school to promote/demote from
  const classBuckets = new Map<string, { id: string; name: string; qa_grade_key: string | null; teacher_name: string | null; student_count: number }>();
  for (const s of students) {
    if (!s.class_id) continue;
    const existing = classBuckets.get(s.class_id);
    if (existing) {
      existing.student_count += 1;
    } else {
      classBuckets.set(s.class_id, {
        id: s.class_id,
        name: s.current_class_name || s.section_class || 'Class',
        qa_grade_key: s.classes?.qa_grade_key ?? s.grade ?? null,
        teacher_name: s.current_teacher_name ?? null,
        student_count: 1,
      });
    }
  }
  const schoolClasses = Array.from(classBuckets.values()).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(
    {
      students,
      class_grade: classGrade,
      feeder_grade: feederGrade,
      feeder_grades: feederGrades,
      school_classes: schoolClasses,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/classes/[id]/enroll
// Body: { studentId: string } — enrol a single student
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await context.params;
  const body = await request.json();
  const studentId: string | undefined = body.studentId;
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard and qa_grade_key/qa_grade_band for promotion sync
  const { data: cls, error: clsErr } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id, term_id, teacher_id, qa_grade_key, qa_grade_band')
    .eq('id', classId)
    .single();

  if (clsErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // ── School boundary + ownership handled inside reinstateStudentToClass ──
  const directClaim =
    caller.role === 'admin'
    || body?.promoteToClassGrade === true
    || Boolean(body?.gradeAction)
    || (body?.forceClaim === true && await isPasteClaimEnabled(admin));
  if (caller.role === 'teacher' && cls.teacher_id && cls.teacher_id !== caller.id && !directClaim) {
    return NextResponse.json({ error: 'Only the primary owner of this class can manage its roster' }, { status: 403 });
  }

  const { data: currentStu } = await admin.from('portal_users').select('grade').eq('id', studentId).maybeSingle();
  const targetGrade = resolveGradeForAction(
    body?.gradeAction,
    (currentStu as any)?.grade,
    cls as any,
    body?.targetGrade,
  );

  const reinstate = await reinstateStudentToClass(admin as any, {
    studentId,
    classId,
    actor: { id: caller.id, role: caller.role },
    grade: targetGrade,
    forceCrossTeacher: directClaim || cls.teacher_id === caller.id,
  });

  if (!reinstate.ok) {
    const status =
      reinstate.code === 'CAPACITY' || reinstate.code === 'OTHER_TEACHER' ? 409
        : reinstate.code === 'FORBIDDEN' || reinstate.code === 'SCHOOL' ? 403
          : reinstate.code === 'NOT_FOUND' ? 404
            : 500;
    return NextResponse.json({ error: reinstate.error, code: reinstate.code }, { status });
  }

  // Enrollment email notification
  (async () => {
    const { data: student } = await admin.from('portal_users').select('email, full_name').eq('id', studentId).single();
    if (!student?.email) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    const html = buildRillcodTransactionalEmailHtml({
      title: `Enrolled in ${cls.name}`,
      bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
        <p>You have been successfully enrolled in <strong>${escapeHtml(cls.name)}</strong>. Your learning materials are ready.</p>`,
      summaryRows: [{ label: 'Class', value: cls.name }],
      cta: { href: `${appUrl}/dashboard`, label: 'Go to Dashboard' },
    });
    await queueService.queueNotification(studentId, 'email', {
      to: student.email,
      subject: `Enrolled in ${cls.name}`,
      html,
    });
  })().catch(console.error);

  return NextResponse.json({
    success: true,
    reinstated: reinstate.wasWithdrawn,
    reportsTransferred: reinstate.reportsTransferred,
    ownerTeacherId: reinstate.ownerTeacherId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/classes/[id]/enroll
// Body: { studentIds: string[] } — batch-enrol multiple students at once
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;

  const { id: classId } = await context.params;
  const body = await request.json();
  const studentIds: string[] | undefined = body.studentIds;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return NextResponse.json({ error: 'studentIds array required' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch class — include max_students for the capacity guard, teacher_id for authorized transfer, qa_grade_key/qa_grade_band for promotion
  const { data: cls } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id, term_id, teacher_id, qa_grade_key, qa_grade_band')
    .eq('id', classId)
    .single();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // When promoting/demoting into a new grade/session or paste-claim is enabled, staff may claim directly.
  const directClaim =
    caller.role === 'admin'
    || body?.promoteToClassGrade === true
    || Boolean(body?.gradeAction)
    || Boolean(body?.studentActions)
    || (body?.forceClaim === true && await isPasteClaimEnabled(admin));

  if (caller.role === 'teacher' && cls.teacher_id && cls.teacher_id !== caller.id && !directClaim) {
    return NextResponse.json({ error: 'Only the primary owner of this class can manage its roster' }, { status: 403 });
  }

  let allowedIds: string[] = studentIds;
  let rejectedNames: string[] = [];

  if (caller.role !== 'admin' && cls.school_id) {
    const { data: clsSchool } = await admin.from('schools').select('name').eq('id', cls.school_id).single();
    const clsSchoolName = clsSchool?.name ?? null;

    const { data: studentRows } = await admin
      .from('portal_users')
      .select('id, full_name, school_id, school_name')
      .in('id', studentIds)
      .eq('role', 'student');

    const eligible = (studentRows ?? []).filter((s: any) => {
      const sameById   = s.school_id === cls.school_id;
      const sameByName = clsSchoolName && s.school_name === clsSchoolName;
      return sameById || sameByName;
    });
    const rejected = (studentRows ?? []).filter((s: any) => !eligible.some((e: any) => e.id === s.id));

    rejectedNames = rejected.map((s: any) => s.full_name ?? s.id);
    allowedIds = eligible.map((s: any) => s.id);

    if (allowedIds.length === 0) {
      return NextResponse.json(
        {
          error: `School boundary violation: none of the selected students belong to this class's school.`,
          rejected: rejectedNames,
        },
        { status: 403 },
      );
    }
  }

  // ── Teacher ownership: only block ACTIVE students under another teacher
  // unless direct claim (paste-claim feature / admin) is active.
  let rejectedOtherTeacher: string[] = [];
  if (!directClaim && caller.role === 'teacher' && allowedIds.length > 0) {
    const { data: studentsWithClass } = await admin
      .from('portal_users')
      .select('id, full_name, class_id')
      .in('id', allowedIds)
      .not('class_id', 'is', null)
      .neq('class_id', classId)
      .eq('role', 'student');

    if ((studentsWithClass ?? []).length > 0) {
      const occupiedClassIds = [...new Set((studentsWithClass ?? []).map((s: any) => s.class_id))];
      const [{ data: occupiedClasses }, { data: rosterRows }] = await Promise.all([
        admin.from('classes').select('id, teacher_id').in('id', occupiedClassIds),
        (admin as any)
          .from('class_term_rosters')
          .select('student_id, class_id, status')
          .in('student_id', (studentsWithClass ?? []).map((s: any) => s.id))
          .in('class_id', occupiedClassIds),
      ]);

      const otherTeacherClassIds = new Set(
        (occupiedClasses ?? [])
          .filter((c: any) => c.teacher_id && c.teacher_id !== caller.id)
          .map((c: any) => c.id),
      );

      const activeOnOther = new Set<string>();
      for (const s of studentsWithClass ?? []) {
        if (!otherTeacherClassIds.has(s.class_id)) continue;
        const roster = (rosterRows ?? []).find(
          (r: any) => r.student_id === s.id && r.class_id === s.class_id,
        );
        const status = roster?.status ?? 'active';
        if (status === 'active') activeOnOther.add(s.id);
      }

      if (activeOnOther.size > 0) {
        const protected_ = (studentsWithClass ?? []).filter((s: any) => activeOnOther.has(s.id));
        rejectedOtherTeacher = protected_.map((s: any) => s.full_name ?? s.id);
        allowedIds = allowedIds.filter((id) => !activeOnOther.has(id));

        if (allowedIds.length === 0) {
          return NextResponse.json(
            {
              error: `Cannot move students: ${rejectedOtherTeacher.length} student(s) are still active in another teacher's class. Enable Allow Paste-Name Claim in LMS Settings to take them directly, or send transfer requests.`,
              protectedStudents: rejectedOtherTeacher,
            },
            { status: 409 },
          );
        }
      }
    }
  }

  const { data: currentStuRows } = allowedIds.length > 0
    ? await admin.from('portal_users').select('id, grade').in('id', allowedIds)
    : { data: [] as any[] };
  const currentGradeById = new Map((currentStuRows ?? []).map((r: any) => [r.id, r.grade]));
  const perStudentActions: Record<string, string> =
    body?.studentActions && typeof body.studentActions === 'object' ? body.studentActions : {};

  const enrolledIds: string[] = [];
  let reportsTransferred = 0;
  for (const sid of allowedIds) {
    const rowAction = perStudentActions[sid] || body?.gradeAction || (body?.promoteToClassGrade === false ? 'retain' : 'promote');
    const resolvedGrade = resolveGradeForAction(
      rowAction,
      currentGradeById.get(sid),
      cls as any,
      body?.targetGrade,
    );
    const result = await reinstateStudentToClass(admin as any, {
      studentId: sid,
      classId,
      actor: { id: caller.id, role: caller.role },
      grade: resolvedGrade,
      forceCrossTeacher: directClaim || cls.teacher_id === caller.id,
    });
    if (result.ok) {
      enrolledIds.push(sid);
      reportsTransferred += result.reportsTransferred;
    }
  }

  const { data: activeTotal } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
  const count = Number(activeTotal ?? 0);

  // Enrollment email notifications for batch (fire-and-forget)
  (async () => {
    if (enrolledIds.length === 0) return;
    const { data: students } = await admin.from('portal_users').select('id, email, full_name').in('id', enrolledIds).eq('role', 'student');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    for (const student of students ?? []) {
      if (!student.email) continue;
      const html = buildRillcodTransactionalEmailHtml({
        title: `Enrolled in ${cls.name}`,
        bodyHtml: `<p>Hi ${escapeHtml(student.full_name?.split(' ')[0] || 'there')},</p>
          <p>You have been successfully enrolled in <strong>${escapeHtml(cls.name)}</strong>. Your learning materials are ready.</p>`,
        summaryRows: [{ label: 'Class', value: cls.name }],
        cta: { href: `${appUrl}/dashboard`, label: 'Go to Dashboard' },
      });
      await queueService.queueNotification(student.id, 'email', {
        to: student.email,
        subject: `Enrolled in ${cls.name}`,
        html,
      });
    }
  })().catch(console.error);

  return NextResponse.json({
    enrolled: enrolledIds.length,
    enrolledIds,
    skipped: studentIds.length - enrolledIds.length,
    rejectedSchoolBoundary: rejectedNames,
    rejectedOtherTeacher,
    reportsTransferred,
    total: count ?? 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/classes/[id]/enroll
// Body: { studentId: string }    — single remove
//    OR { studentIds: string[] } — bulk remove
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;
  const admin = adminClient();

  // Fetch class school for the access guard
  const { data: cls } = await admin.from('classes').select('id, school_id, program_id, term_id').eq('id', classId).single();

  // ── Caller school/class access guard ─────────────────────────────────────
  const hasAccess = await callerHasClassAccess(caller, cls?.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  // Normalise single or bulk into an array
  const body = await request.json();
  let ids: string[] = [];
  if (Array.isArray(body.studentIds) && body.studentIds.length > 0) {
    ids = body.studentIds;
  } else if (typeof body.studentId === 'string' && body.studentId) {
    ids = [body.studentId];
  }
  if (ids.length === 0) return NextResponse.json({ error: 'studentId or studentIds required' }, { status: 400 });

  // Two modes:
  //  • Soft unenrol (default): KEEP the class tie so the student is never classless and the
  //    class keeps its history — they're just marked 'withdrawn' in this term's roster.
  //    portal_users.is_active is intentionally NOT changed: parents and learners keep login
  //    access to published reports, invoices, certificates, and other historical records.
  //  • Hard remove (body.hard === true): fully WIPE the student account (all FK children +
  //    students + portal_users + auth) — a complete admin-style delete, not just a detach.
  if (body.hard === true) {
    // Only students actually in THIS class can be wiped from here (safety).
    const { data: inClass } = await admin
      .from('portal_users').select('id').in('id', ids).eq('class_id', classId).eq('role', 'student');
    const wipeIds = (inClass ?? []).map((r: any) => r.id);
    let wiped = 0;
    for (const uid of wipeIds) {
      const { error } = await (admin as any).rpc('hard_delete_portal_user', { p_id: uid });
      if (!error) { await admin.auth.admin.deleteUser(uid).catch(() => {}); wiped += 1; }
    }
    // Resync count and return — the accounts no longer exist, so no roster/enrolment steps.
    const { data: afterCount } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
    await admin.from('classes').update({ current_students: afterCount ?? 0 }).eq('id', classId);
    return NextResponse.json({ success: true, hardDeleted: wiped });
  }

  if (cls) await upsertClassTermRoster(admin, cls, ids, 'withdrawn', caller.id);

  // A withdrawal is two writes: the roster row, and the programme enrolment.
  //
  // The second one's result was discarded. When it failed, nothing said so and
  // this route still answered success — leaving a learner withdrawn on the
  // roster and still actively enrolled in the programme. Two learners were
  // found in exactly that state, their enrolments last touched four months
  // before the withdrawal that was supposed to suspend them.
  //
  // Reported rather than thrown: the roster write has already happened, so
  // failing the whole request here would claim nothing was withdrawn when in
  // fact half of it was. The caller is told precisely which half is missing.
  let enrolmentSuspended = true;
  if (cls?.program_id) {
    const { error: suspendError } = await admin
      .from('enrollments')
      .update({
        status: 'suspended',
        updated_at: new Date().toISOString(),
        notes: 'Paused from current term class roster; history and reports preserved.',
      })
      .in('user_id', ids)
      .eq('program_id', cls.program_id);
    if (suspendError) {
      enrolmentSuspended = false;
      console.error('[unenrol] roster updated but programme enrolment not suspended:', suspendError);
    }
  }

  // Resync class count (exact — never drift)
  const { data: afterCount } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
  await admin.from('classes').update({ current_students: afterCount ?? 0 }).eq('id', classId);

  return NextResponse.json({
    success: true,
    removed: ids.length,
    enrolment_suspended: enrolmentSuspended,
    ...(enrolmentSuspended
      ? {}
      : {
        warning:
            'Removed from the class register, but the programme enrolment could not be paused. '
            + 'Run scripts/audit-class-headcount.ts to see who is affected.',
      }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/classes/[id]/enroll
// Session Roster Confirmation, Grade Sync, Withdrawals & Inline Quick-Add:
// Body:
//  • updates?: Array<{ studentId: string; grade: string }>
//  • withdrawStudentIds?: string[]
//  • quickAddNames?: string[] | string
//  • defaultGrade?: string
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const staffResult = await requireStaff();
  if (!staffResult || '_err' in staffResult) {
    return NextResponse.json(
      { error: staffResult ? `Access denied [${(staffResult as any)._err}]` : 'Access denied' },
      { status: 403 },
    );
  }
  const caller = staffResult as Caller;
  const { id: classId } = await context.params;
  const admin = adminClient();

  const { data: cls } = await admin
    .from('classes')
    .select('id, name, program_id, max_students, school_id, term_id, teacher_id, qa_grade_key, qa_grade_band, schools(name)')
    .eq('id', classId)
    .single();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const hasAccess = await callerHasClassAccess(caller, cls.school_id ?? null);
  if (!hasAccess) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const updates: Array<{ studentId: string; grade: string }> = Array.isArray(body?.updates)
    ? body.updates
    : [];
  const withdrawIds: string[] = Array.isArray(body?.withdrawStudentIds)
    ? body.withdrawStudentIds.filter(Boolean)
    : [];
  const rawQuickNames = body?.quickAddNames;
  const quickLines: string[] = Array.isArray(rawQuickNames)
    ? rawQuickNames.map((s) => String(s ?? '').trim()).filter(Boolean)
    : typeof rawQuickNames === 'string' && rawQuickNames.trim()
      ? rawQuickNames
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const schoolName = (cls as any).schools?.name ?? null;
  const nowIso = new Date().toISOString();

  // 1. Apply in-place grade confirmations / promotions on current roster members
  let updatedCount = 0;
  const confirmedIds: string[] = [];
  for (const item of updates) {
    const sid = item?.studentId?.trim();
    const cleanedG = cleanGrade(item?.grade) ?? item?.grade?.trim();
    if (!sid || !cleanedG) continue;

    const { error: pErr } = await admin
      .from('portal_users')
      .update({
        grade: cleanedG,
        class_id: classId,
        section_class: cls.name,
        is_active: true,
        updated_at: nowIso,
      })
      .eq('id', sid)
      .eq('role', 'student');

    if (!pErr) {
      updatedCount += 1;
      confirmedIds.push(sid);
      await admin
        .from('students')
        .update({
          grade: cleanedG,
          grade_level: cleanedG,
          section: cls.name,
          current_class: cls.name,
          is_active: true,
          status: 'active',
          updated_at: nowIso,
        })
        .eq('user_id', sid);
    }
  }
  if (confirmedIds.length > 0) {
    await upsertClassTermRoster(admin, cls as any, confirmedIds, 'active', caller.id);
  }

  // 2. Withdraw unconfirmed / departed students while keeping their historical records intact
  let withdrawnCount = 0;
  if (withdrawIds.length > 0) {
    await upsertClassTermRoster(admin, cls as any, withdrawIds, 'withdrawn', caller.id);
    if (cls.program_id) {
      await admin
        .from('enrollments')
        .update({
          status: 'suspended',
          updated_at: nowIso,
          notes: 'Paused during session roster confirmation; history and reports preserved.',
        })
        .in('user_id', withdrawIds)
        .eq('program_id', cls.program_id);
    }
    withdrawnCount = withdrawIds.length;
  }

  // 3. Inline Quick-Add / Smart Auto-Adopt (zero duplicate accounts)
  const quickAdded: Array<{
    fullName: string;
    grade: string | null;
    mode: 'adopted' | 'created' | 'confirmed';
    studentId: string;
    email?: string;
    password?: string | null;
  }> = [];
  const quickErrors: Array<{ input: string; error: string }> = [];

  if (quickLines.length > 0) {
    const existingPool = await loadSchoolStudentsForClaim(
      admin as any,
      cls.school_id ?? null,
      schoolName,
      classId,
    ).catch(() => []);

    const existingGradesMap = new Map<string, string | null>();
    if (existingPool.length > 0) {
      const { data: gradeRows } = await admin
        .from('portal_users')
        .select('id, grade')
        .in('id', existingPool.slice(0, 500).map((s) => s.id));
      for (const r of gradeRows ?? []) existingGradesMap.set((r as any).id, (r as any).grade ?? null);
    }

    const defaultFallbackGrade =
      cleanGrade(body?.defaultGrade)
      ?? resolveGradeForAction('promote', null, cls as any);

    for (const rawLine of quickLines) {
      const parsedInline = parseBulkGrade(rawLine);
      const stripped = stripBulkGrade(rawLine);
      const cleanedName = cleanStudentName(stripped || rawLine) || parsePastedStudentNames([rawLine])[0];
      if (!cleanedName || cleanedName.length < 2) continue;

      const match = matchPastedNamesToStudents([cleanedName], existingPool, classId)[0];
      const matchedCandidate =
        match?.status === 'claimable' || match?.status === 'already_here'
          ? match.student
          : match?.status === 'ambiguous' && match.candidates.length > 0
            ? match.candidates[0]
            : null;

      if (matchedCandidate) {
        const currentG = existingGradesMap.get(matchedCandidate.id) ?? null;
        const targetG =
          parsedInline?.grade
          ?? cleanGrade(body?.defaultGrade)
          ?? resolveGradeForAction('promote', currentG, cls as any)
          ?? defaultFallbackGrade;

        const reinstate = await reinstateStudentToClass(admin as any, {
          studentId: matchedCandidate.id,
          classId,
          actor: { id: caller.id, role: caller.role },
          grade: targetG,
          classArm: parsedInline?.arm ?? null,
          forceCrossTeacher: true,
        });

        if (reinstate.ok) {
          await ensureStudentCardIssued(admin as any, {
            holderId: matchedCandidate.id,
            schoolId: cls.school_id ?? null,
            classId,
            actorId: caller.id,
            metadata: { source: 'session_roster_adopt' },
          }).catch(() => {});

          quickAdded.push({
            fullName: reinstate.fullName,
            grade: targetG ?? null,
            mode: match?.status === 'already_here' ? 'confirmed' : 'adopted',
            studentId: reinstate.studentId,
            email: reinstate.email,
          });
        } else {
          quickErrors.push({ input: cleanedName, error: reinstate.error });
        }
        continue;
      }

      // Not in school yet -> provision brand-new student account & sync to class, registry, and cards
      const targetG = parsedInline?.grade ?? defaultFallbackGrade;
      const slug = cleanedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 28) || 'student';
      const rand = Math.random().toString(36).slice(2, 6);
      const generatedEmail = `${slug}.${rand}@student.rillcod.com`;

      const provisioned = await findOrCreateStudentPortal(admin as any, {
        email: generatedEmail,
        fullName: cleanedName,
        schoolId: cls.school_id ?? null,
        schoolName,
        classId,
        sectionClass: cls.name,
        grade: targetG,
        enrollmentType: 'school',
        batchLabel: `Inline Roster Add · ${cls.name}`,
        classNameForArchive: cls.name,
      });

      if (!provisioned.ok || !provisioned.studentId) {
        quickErrors.push({ input: cleanedName, error: provisioned.error || 'Could not create student account' });
        continue;
      }

      // Ensure students registry shadow row exists & is synced
      const { data: existingReg } = await admin
        .from('students')
        .select('id')
        .eq('user_id', provisioned.studentId)
        .maybeSingle();
      if (!existingReg?.id) {
        await admin.from('students').insert({
          user_id: provisioned.studentId,
          full_name: cleanedName,
          name: cleanedName,
          student_email: provisioned.email ?? generatedEmail,
          school_id: cls.school_id ?? null,
          school_name: schoolName,
          section: cls.name,
          current_class: cls.name,
          grade: targetG ?? null,
          grade_level: targetG ?? null,
          status: 'active',
          is_active: true,
        });
      }

      await reinstateStudentToClass(admin as any, {
        studentId: provisioned.studentId,
        classId,
        actor: { id: caller.id, role: caller.role },
        grade: targetG,
        classArm: parsedInline?.arm ?? null,
        forceCrossTeacher: true,
      });

      await ensureStudentCardIssued(admin as any, {
        holderId: provisioned.studentId,
        schoolId: cls.school_id ?? null,
        classId,
        actorId: caller.id,
        metadata: { source: 'inline_quick_add' },
      }).catch(() => {});

      quickAdded.push({
        fullName: cleanedName,
        grade: targetG ?? null,
        mode: 'created',
        studentId: provisioned.studentId,
        email: provisioned.email,
        password: provisioned.password ?? null,
      });
    }
  }

  const { data: afterCount } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
  await admin.from('classes').update({ current_students: Number(afterCount ?? 0) }).eq('id', classId);

  return NextResponse.json({
    success: true,
    updatedCount,
    withdrawnCount,
    quickAdded,
    quickErrors,
    total: Number(afterCount ?? 0),
  });
}
