import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { bandForGrade, buildClassName, cleanClassName } from '@/lib/classes/naming';
import { hasLearnerAssignmentEvidence } from '@/lib/academic/record-retention';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

async function teacherCanOwnSchool(teacherId: string, schoolId: string): Promise<boolean> {
  const admin = adminClient();
  const { data: teacher } = await admin.from('portal_users')
    .select('id, role, school_id, is_active, is_deleted').eq('id', teacherId).maybeSingle();
  if (!teacher || teacher.role !== 'teacher' || teacher.is_active === false || teacher.is_deleted === true) return false;
  if (teacher.school_id === schoolId) return true;
  const { data: assignment } = await admin.from('teacher_schools').select('teacher_id')
    .eq('teacher_id', teacherId).eq('school_id', schoolId).maybeSingle();
  return Boolean(assignment);
}
/**
 * Returns true when the caller can manage (write/delete) the given class.
 * - admin:  always
 * - teacher: assigned to the class's school via teacher_schools OR primary school_id
 * - school:  class belongs to their school
 */
async function callerCanManageClass(caller: Caller, classSchoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!classSchoolId) {
    // Class has no school — only admin can manage it
    return caller.role === 'admin';
  }
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

async function classHasProtectedAcademicEvidence(admin: ReturnType<typeof adminClient>, classId: string) {
  const [assignments, cbtExams, writtenExams, reports, termGrades, evidence] = await Promise.all([
    admin.from('assignments').select('id').eq('class_id', classId),
    admin.from('cbt_exams').select('id').eq('class_id', classId),
    admin.from('exams').select('id').eq('class_id', classId),
    admin.from('student_progress_reports')
      .select('is_published,calculation_mode,theory_score,practical_score,attendance_score,participation_score,overall_score')
      .eq('class_id', classId),
    admin.from('enrollment_term_grades').select('id', { count: 'exact', head: true }).eq('class_id', classId),
    admin.from('academic_assessment_evidence').select('id', { count: 'exact', head: true }).eq('class_id', classId),
  ]);
  const lookupError = [assignments.error, cbtExams.error, writtenExams.error, reports.error, termGrades.error, evidence.error]
    .find(Boolean);
  if (lookupError) throw lookupError;

  const assignmentIds = (assignments.data ?? []).map((row) => row.id);
  const cbtExamIds = (cbtExams.data ?? []).map((row) => row.id);
  const writtenExamIds = (writtenExams.data ?? []).map((row) => row.id);
  const [submissions, cbtAttempts, writtenAttempts] = await Promise.all([
    assignmentIds.length
      ? admin.from('assignment_submissions')
        .select('id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status')
        .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    cbtExamIds.length
      ? admin.from('cbt_sessions').select('id').in('exam_id', cbtExamIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
    writtenExamIds.length
      ? admin.from('exam_attempts').select('id').in('exam_id', writtenExamIds).limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const evidenceError = [submissions.error, cbtAttempts.error, writtenAttempts.error].find(Boolean);
  if (evidenceError) throw evidenceError;

  const reportHasEvidence = (reports.data ?? []).some((report: any) =>
    report.is_published === true
    || report.calculation_mode === 'manual'
    || [report.theory_score, report.practical_score, report.attendance_score, report.participation_score, report.overall_score]
      .some((score) => score != null));
  return (submissions.data ?? []).some(hasLearnerAssignmentEvidence)
    || (cbtAttempts.data?.length ?? 0) > 0
    || (writtenAttempts.data?.length ?? 0) > 0
    || reportHasEvidence
    || (termGrades.count ?? 0) > 0
    || (evidence.count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes/[id]
// Fetch a single class with related data.
// Access: admin (any), teacher (any in their school(s)), school (own school only)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch the class first so we can do a pre-query school check
  const { data, error } = await admin
    .from('classes')
    .select('*, programs(id, name, difficulty_level), portal_users!classes_teacher_id_fkey(id, full_name), schools(id, name), academic_terms(id, academic_year, term_label, term_number), academic_offerings(id, title, enrollment_type, pathway, programme_id), academic_offering_periods(id, label, sequence_number, starts_on, ends_on)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  // ── Access guard ──────────────────────────────────────────────────────────
  if (caller.role !== 'admin') {
    const classSchoolId = (data as any).school_id ?? null;
    const canAccess = await callerCanManageClass(caller, classSchoolId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Access denied: class is outside your school scope' }, { status: 403 });
    }
  }

  return NextResponse.json({ data });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/classes/[id]
// Update class fields. Caller must have school access to the class.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  // school role cannot mutate classes directly (read-only for them)
  if (caller.role === 'school') {
    return NextResponse.json({ error: 'School accounts cannot edit class records directly' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  // Fetch the class to check school access
  const { data: cls } = await admin
    .from('classes')
    .select('school_id, name, teacher_id, program_id, current_course_id')
    .eq('id', id)
    .maybeSingle();

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const canManage = await callerCanManageClass(caller, cls.school_id ?? null);
  if (!canManage) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to' },
      { status: 403 },
    );
  }

  const body = await request.json();
  if (('teacher_id' in body && typeof body.teacher_id !== 'string') || ('school_id' in body && typeof body.school_id !== 'string')) {
    return NextResponse.json({ error: 'Class school and primary owner cannot be cleared' }, { status: 400 });
  }
  if ('teacher_id' in body && caller.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can transfer primary class ownership' }, { status: 403 });
  }
  const effectiveSchoolId = typeof body.school_id === 'string' ? body.school_id : cls.school_id;
  const effectiveTeacherId = typeof body.teacher_id === 'string' ? body.teacher_id : cls.teacher_id;
  if (!effectiveSchoolId || !effectiveTeacherId) {
    return NextResponse.json({ error: 'Every class requires a school and a primary teacher owner' }, { status: 400 });
  }
  if (('teacher_id' in body || 'school_id' in body) && !(await teacherCanOwnSchool(effectiveTeacherId, effectiveSchoolId))) {
    return NextResponse.json({ error: 'Class owner must be an active teacher assigned to the selected school' }, { status: 400 });
  }

  // ── Field whitelist — current_students excluded (managed by enroll route only) ──
  const allowed: Record<string, unknown> = {};
  const allowedFields = [
    'name', 'description', 'program_id', 'teacher_id', 'current_course_id',
    'max_students', 'status', 'schedule', 'start_date', 'end_date', 'term_id',
    'qa_grade_key', 'qa_grade_mode', 'qa_grade_band', 'qa_track_hint', 'qa_spine_lane',
  ];

  // school_id: only admin can reassign a class to a different school
  if (caller.role === 'admin' && 'school_id' in body) {
    allowed.school_id = body.school_id ?? null;
  }

  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }

  const effectiveProgramId = typeof allowed.program_id === 'string' ? allowed.program_id : cls.program_id;
  if (typeof body.grade === 'string' && body.grade.trim()) {
    const granularity = body.band_granularity === 'single' ? 'single' : 'fixed';
    const band = bandForGrade(body.grade, granularity);
    if (!band) return NextResponse.json({ error: 'Choose a valid class grade or range.' }, { status: 400 });
    const [{ data: school }, { data: programme }] = await Promise.all([
      admin.from('schools').select('name').eq('id', effectiveSchoolId).maybeSingle(),
      admin.from('programs').select('name').eq('id', effectiveProgramId).maybeSingle(),
    ]);
    if (!programme?.name) return NextResponse.json({ error: 'The class programme is required before changing its range.' }, { status: 400 });
    allowed.band_lvl = band.lvl;
    allowed.band_low = band.low;
    allowed.band_high = band.high;
    allowed.qa_grade_band = band.label;
    allowed.name = buildClassName({
      schoolName: school?.name || '',
      programme: programme.name,
      range: band.label,
      online: false,
    });
  }

  const effectiveCourseId = 'current_course_id' in allowed
    ? (typeof allowed.current_course_id === 'string' ? allowed.current_course_id : null)
    : cls.current_course_id;
  if (effectiveCourseId) {
    const { data: selectedCourse } = await admin
      .from('courses')
      .select('id, program_id')
      .eq('id', effectiveCourseId)
      .maybeSingle();
    if (!selectedCourse || selectedCourse.program_id !== effectiveProgramId) {
      if ('current_course_id' in body) {
        return NextResponse.json({ error: 'The selected course does not belong to this programme.' }, { status: 400 });
      }
      // Programme changed without an explicit replacement course.
      allowed.current_course_id = null;
    }
  }
  if (typeof allowed.name === 'string') {
    allowed.name = cleanClassName(allowed.name);
  }
  allowed.updated_at = new Date().toISOString();

  // If the class name changed, update section_class on all enrolled students
  const newName: string | null = typeof allowed.name === 'string' ? allowed.name : null;
  const nameChanged = !!newName && newName !== cls.name;

  const { error } = await admin
    .from('classes')
    .update(allowed)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep section_class in sync if name was renamed
  if (nameChanged) {
    await admin
      .from('portal_users')
      .update({ section_class: newName })
      .eq('class_id', id)
      .eq('role', 'student');
  }

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/classes/[id]
// Caller must be admin or a teacher/school assigned to the class's school.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  // school role cannot delete classes
  if (caller.role === 'school') {
    return NextResponse.json({ error: 'School accounts cannot delete class records' }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = adminClient();

  const { data: cls } = await admin
    .from('classes')
    .select('school_id, name, teacher_id')
    .eq('id', id)
    .maybeSingle();

  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const canManage = await callerCanManageClass(caller, cls.school_id ?? null);
  if (!canManage) {
    return NextResponse.json(
      { error: 'Access denied: you are not assigned to the school this class belongs to' },
      { status: 403 },
    );
  }

  const cleanupPolicy = await loadCleanupPolicy(admin as any);
  if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
    return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
  }

  // Prefer the database transaction: it repeats actor/school checks and rolls
  // student roster cleanup back if any class dependency refuses deletion.
  const atomic = await (admin as any).rpc('delete_rebuildable_class', {
    p_class_id: id,
    p_actor_id: caller.id,
  });
  let detachedStudents = 0;
  if (!atomic.error) {
    detachedStudents = Number(atomic.data?.detached_students ?? 0);
  } else {
    const code = String(atomic.error.code ?? '');
    const message = String(atomic.error.message ?? '');
    if (message.includes('PROTECTED_ACADEMIC_EVIDENCE')) {
      return NextResponse.json({
        error: 'This class contains learner submissions, attempts, reports, term grades, or assessment evidence. Keep the class as a historical record instead of deleting it.',
        code: 'PROTECTED_ACADEMIC_EVIDENCE',
      }, { status: 409 });
    }
    if (code === '42501') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const functionUnavailable = ['PGRST202', '42883'].includes(code)
      || message.toLowerCase().includes('could not find the function')
      || message.toLowerCase().includes('does not exist');
    if (!functionUnavailable) {
      console.error('[classes.delete] atomic cleanup failed', { classId: id, code });
      return NextResponse.json({
        error: code === '23503'
          ? 'This class is still used by a teaching plan or another operational record. Remove or move that draft first.'
          : 'The class could not be removed safely. Nothing was changed; please retry.',
      }, { status: code === '23503' ? 409 : 500 });
    }

    // Rolling-deployment fallback. Read evidence first, delete the class before
    // touching student labels, and rely on the existing FK to clear class_id.
    // This avoids the former half-detached roster when the class delete failed.
    try {
      if (await classHasProtectedAcademicEvidence(admin, id)) {
        return NextResponse.json({
          error: 'This class contains learner submissions, attempts, reports, term grades, or assessment evidence. Keep the class as a historical record instead of deleting it.',
          code: 'PROTECTED_ACADEMIC_EVIDENCE',
        }, { status: 409 });
      }
    } catch (e: any) {
      console.error('[classes.delete] evidence preflight failed', { classId: id, code: e?.code });
      return NextResponse.json({ error: 'Academic records could not be verified. Nothing was deleted; please retry.' }, { status: 503 });
    }

    const { data: roster } = await admin.from('portal_users').select('id').eq('class_id', id).eq('role', 'student');
    const { error: deleteError } = await admin.from('classes').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json({
        error: deleteError.code === '23503'
          ? 'This class is still used by a teaching plan or another operational record. Remove or move that draft first.'
          : 'The class could not be removed safely. Nothing was changed; please retry.',
      }, { status: deleteError.code === '23503' ? 409 : 500 });
    }
    const rosterIds = (roster ?? []).map((student) => student.id);
    detachedStudents = rosterIds.length;
    if (rosterIds.length > 0) {
      const { error: labelError } = await admin.from('portal_users')
        .update({ section_class: null })
        .in('id', rosterIds)
        .eq('role', 'student');
      if (labelError) console.error('[classes.delete] stale class label cleanup failed', { classId: id, code: labelError.code });
    }
  }

  await logAudit(admin as any, {
    action: 'delete_class',
    actorId: caller.id,
    resourceType: 'class',
    resourceId: id,
    oldValue: (cls as any)?.name ?? null,
    newValues: { detached_students: detachedStudents, atomic: !atomic.error },
  });
  return NextResponse.json({ success: true, detached_students: detachedStudents });
}
