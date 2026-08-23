import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { bandForGrade, buildClassName, cleanClassName } from '@/lib/classes/naming';
import { deleteRebuildableClass } from '@/lib/operations/delete-rebuildable-class';

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

  const removed = await deleteRebuildableClass({
    admin: admin as any,
    classId: id,
    actorId: caller.id,
  });
  if (!removed.ok) {
    return NextResponse.json(
      { error: removed.error, code: removed.code },
      { status: removed.status },
    );
  }

  await logAudit(admin as any, {
    action: 'delete_class',
    actorId: caller.id,
    resourceType: 'class',
    resourceId: id,
    oldValue: (cls as any)?.name ?? null,
    newValues: { detached_students: removed.detachedStudents, atomic: removed.atomic },
  });
  return NextResponse.json({ success: true, detached_students: removed.detachedStudents });
}
