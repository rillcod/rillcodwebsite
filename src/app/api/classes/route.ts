import { after, NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildClassName, parseGrades, formatGradeRange, gradeBand, bandForGrade, parseBandLabel, canonicalTier, cleanClassName } from '@/lib/classes/naming';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { selectAutomaticClassTeacher } from '@/lib/classes/teacher-allocation';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

import { runClassAcademicReadiness } from '@/lib/academic/prepare-class-readiness';

function prepareAcademicClass(classId: string) {
  after(() => runClassAcademicReadiness(classId));
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return null;
  const admin = adminClient();
  const { data: caller } = await admin
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

/** Returns all school IDs a teacher is assigned to (primary + teacher_schools). */
async function teacherSchoolIds(caller: Caller): Promise<string[]> {
  const ids: string[] = [];
  if (caller.school_id) ids.push(caller.school_id);
  const { data: ts } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id);
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id);
  });
  return ids;
}

async function teacherCanOwnSchool(admin: ReturnType<typeof adminClient>, teacherId: string, schoolId: string) {
  const { data: teacher } = await admin.from('portal_users')
    .select('id, role, school_id, is_active, is_deleted').eq('id', teacherId).maybeSingle();
  if (!teacher || teacher.role !== 'teacher' || teacher.is_active === false || teacher.is_deleted === true) return false;
  if (teacher.school_id === schoolId) return true;
  const { data: assignment } = await admin.from('teacher_schools').select('id')
    .eq('teacher_id', teacherId).eq('school_id', schoolId).maybeSingle();
  return !!assignment;
}
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/classes
// Returns classes visible to the current user with accurate student counts.
//   admin:   all classes (optionally filtered by ?school_id=)
//   teacher: classes in their assigned school(s) (optionally filtered by ?school_id= if in scope)
//   school:  only classes belonging to their own school
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const admin = adminClient();
    const { searchParams } = new URL(request.url);
    const schoolFilter = searchParams.get('school_id');
    // ?mine=true: for teacher role, return only classes they personally teach
    const mineOnly = searchParams.get('mine') === 'true';

    let query = admin
      .from('classes')
      .select(`
        id, name, description, status, max_students, current_students,
        start_date, end_date, schedule, teacher_id, program_id, current_course_id, school_id, term_id, academic_offering_id, offering_period_id, created_at,
        academic_offerings ( id, title, enrollment_type, pathway, programme_id ),
        academic_offering_periods ( id, label, sequence_number, starts_on, ends_on ),
        qa_grade_key, qa_grade_band, qa_track_hint, qa_spine_lane,
        band_lvl, band_low, band_high,
        academic_terms ( id, academic_year, term_label, term_number ),
        programs ( id, name ),
        portal_users!classes_teacher_id_fkey ( id, full_name ),
        schools ( id, name )
      `)
      .order('created_at', { ascending: false });

    if (caller.role === 'admin') {
      // Admin may optionally filter by school
      if (schoolFilter) query = query.eq('school_id', schoolFilter) as any;
    } else if (caller.role === 'school') {
      // School role: strictly limited to their own school only — ignore any schoolFilter param
      if (!caller.school_id) return NextResponse.json({ data: [] });
      query = query.eq('school_id', caller.school_id) as any;
    } else if (caller.role === 'teacher') {
      // ?mine=true or isolation enabled → only classes this teacher personally teaches
      const isIsolated = await isTeacherIsolationOn(admin);

      if (isIsolated || mineOnly) {
        const scope = await getTeacherClassScope(admin, caller.id, caller.school_id);
        if (schoolFilter && !scope.assignedSchoolIds.includes(schoolFilter)) {
          return NextResponse.json({ data: [] });
        }
        if (scope.classIds.length === 0) return NextResponse.json({ data: [] });
        query = query.in('id', scope.classIds) as any;
        if (schoolFilter) query = query.eq('school_id', schoolFilter) as any;
      } else {
        const scopedIds = await teacherSchoolIds(caller);

        if (schoolFilter) {
          if (!scopedIds.includes(schoolFilter)) {
            return NextResponse.json({ data: [] });
          }
          query = query.eq('school_id', schoolFilter) as any;
        } else if (scopedIds.length > 0) {
          query = query.or(
            `teacher_id.eq.${caller.id},school_id.in.(${scopedIds.join(',')})`,
          ) as any;
        } else {
          query = query.eq('teacher_id', caller.id) as any;
        }
      }
    }

    const termFilter = searchParams.get('term_id');
    if (termFilter) {
      query = query.or(`term_id.eq.${termFilter},term_id.is.null`) as any;
    }

    const { data: classes, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const classData = classes ?? [];
    if (classData.length === 0) return NextResponse.json({ data: [] });

    // ── Live student count ────────────────────────────────────────────────────
    const classIds = classData.map((c: any) => c.id).filter(Boolean) as string[];
    const countMap: Record<string, number> = {};
    classIds.forEach((cid) => { countMap[cid] = 0; });

    // 1. Students directly assigned via class_id FK
    const { data: directStudents } = await admin
      .from('portal_users')
      .select('class_id')
      .eq('role', 'student')
      .in('class_id', classIds);

    (directStudents ?? []).forEach((s: any) => {
      if (s.class_id) countMap[s.class_id] = (countMap[s.class_id] ?? 0) + 1;
    });

    // 2. Also count section_class-matched students whose class_id is not yet set
    //    (covers legacy / pre-heal students that appear inside the class detail)
    const schoolIds = [...new Set(classData.map((c: any) => c.school_id).filter(Boolean))] as string[];
    if (schoolIds.length > 0) {
      const { data: sectionStudents } = await admin
        .from('portal_users')
        .select('school_id, section_class')
        .eq('role', 'student')
        .is('class_id', null)
        .in('school_id', schoolIds);

      // Build lookup: "schoolId::className" → classId
      const lookup: Record<string, string> = {};
      classData.forEach((c: any) => {
        if (c.school_id && c.name) lookup[`${c.school_id}::${c.name}`] = c.id;
      });

      (sectionStudents ?? []).forEach((s: any) => {
        const cid = lookup[`${s.school_id}::${s.section_class}`];
        if (cid) countMap[cid] = (countMap[cid] ?? 0) + 1;
      });
    }
    // Current-term active rosters are authoritative. The database function also
    // includes unrostered legacy members so old imports remain visible.
    const activeCounts = await Promise.all(classIds.map(async (classId) => {
      const { data } = await (admin as any).rpc('active_class_student_count', { p_class_id: classId });
      return [classId, Number(data ?? 0)] as const;
    }));
    for (const [classId, count] of activeCounts) countMap[classId] = count;


    // Fall back to the DB-synced current_students when live count is still 0
    // (covers program-enrolled students not yet healed by the detail page)
    const enriched = classData.map((c: any) => ({
      ...c,
      current_students: countMap[c.id] ?? c.current_students ?? 0,
    }));

    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/classes — create a new class
// admin: full control; teacher: must be assigned to the chosen school
// school role: cannot create classes via API
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    if (!['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Only admins and teachers can create classes' }, { status: 403 });
    }

    const body = await request.json();
    const enrollmentType = ['school', 'online', 'in_person', 'special'].includes(String(body.enrollment_type))
      ? String(body.enrollment_type)
      : 'school';

    const preferredOfferingId = typeof body.academic_offering_id === 'string' && body.academic_offering_id
      ? body.academic_offering_id
      : null;
    // ── Field whitelist — never trust raw body ────────────────────────────────
    const insertRow: Record<string, unknown> = {};
    const allowedFields = ['name', 'description', 'program_id', 'current_course_id', 'max_students', 'status', 'schedule', 'start_date', 'end_date', 'term_id'];
    for (const f of allowedFields) {
      if (f in body && body[f] != null) insertRow[f] = body[f];
    }

    if (!insertRow.name && !insertRow.program_id) {
      return NextResponse.json({ error: 'A class name, or a programme to auto-name it, is required' }, { status: 400 });
    }

    const admin = adminClient();

    // Keep class setup and report entry aligned: a course focus may only come
    // from the programme selected for this class.
    if (insertRow.current_course_id) {
      if (!insertRow.program_id) {
        return NextResponse.json({ error: 'Select a programme before choosing a course.' }, { status: 400 });
      }
      const { data: selectedCourse } = await admin
        .from('courses')
        .select('id, program_id')
        .eq('id', insertRow.current_course_id as string)
        .maybeSingle();
      if (!selectedCourse || selectedCourse.program_id !== insertRow.program_id) {
        return NextResponse.json({ error: 'The selected course does not belong to this programme.' }, { status: 400 });
      }
    }

    if (caller.role === 'teacher') {
      // Force teacher_id to the caller — they cannot assign to another teacher
      insertRow.teacher_id = caller.id;

      // Validate school_id is one the teacher is actually assigned to
      const requestedSchoolId: string | null = typeof body.school_id === 'string' ? body.school_id : null;
      if (requestedSchoolId) {
        const scopedIds = await teacherSchoolIds(caller);
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this class.' },
            { status: 403 },
          );
        }
        insertRow.school_id = requestedSchoolId;
      } else if (caller.school_id) {
        // Default to teacher's primary school if none specified
        insertRow.school_id = caller.school_id;
      } else {
        return NextResponse.json(
          { error: 'A class must belong to a school. You are not assigned to any school.' },
          { status: 400 },
        );
      }
    } else {
      // Admin: school_id is required — classes cannot exist without a school
      const schoolId = typeof body.school_id === 'string' ? body.school_id : null;
      if (!schoolId) {
        return NextResponse.json(
          { error: 'school_id is required. A class must belong to a school.' },
          { status: 400 },
        );
      }
      insertRow.school_id = schoolId;
      let ownerId = typeof body.teacher_id === 'string' && body.teacher_id ? body.teacher_id : null;
      // Inline canonical creation (for example from bulk registration) may ask
      // the server to choose an existing teacher already assigned to the school.
      if (!ownerId && body.auto_assign_teacher === true) {
        ownerId = (await selectAutomaticClassTeacher(admin, schoolId))?.id ?? null;
      }
      if (!ownerId && body.auto_assign_teacher === true) {
        const { data: assignments } = await admin
          .from('teacher_schools')
          .select('teacher_id')
          .eq('school_id', schoolId);
        for (const assignment of assignments ?? []) {
          const candidateId = (assignment as { teacher_id?: string }).teacher_id;
          if (candidateId && await teacherCanOwnSchool(admin, candidateId, schoolId)) {
            ownerId = candidateId;
            break;
          }
        }
        if (!ownerId) {
          const { data: schoolTeacher } = await admin
            .from('portal_users')
            .select('id')
            .eq('role', 'teacher')
            .eq('school_id', schoolId)
            .eq('is_active', true)
            .eq('is_deleted', false)
            .limit(1)
            .maybeSingle();
          ownerId = (schoolTeacher as { id?: string } | null)?.id ?? null;
        }
      }
      if (!ownerId) {
        return NextResponse.json({ error: 'No assigned teacher is available to own this class.' }, { status: 400 });
      }
      if (!await teacherCanOwnSchool(admin, ownerId, schoolId)) {
        if (caller.role === 'admin') {
          const { error: assocErr } = await admin
            .from('teacher_schools')
            .insert({
              teacher_id: ownerId,
              school_id: schoolId,
              assigned_by: caller.id,
              assigned_at: new Date().toISOString(),
              is_primary: false,
            });
          if (assocErr) {
            return NextResponse.json({ error: `Failed to automatically assign the teacher to this school: ${assocErr.message}` }, { status: 500 });
          }
        } else {
          return NextResponse.json({ error: 'The selected class owner is not an active teacher assigned to this school.' }, { status: 400 });
        }
      }
      insertRow.teacher_id = ownerId;
    }

    insertRow.created_at = new Date().toISOString();
    // current_students starts at 0 — set by enroll routes, never by client
    insertRow.current_students = 0;

    // Canonical placement fields — one consistent convention for EVERY class, whether
    // auto-named or teacher-named. Derive the tier (from the programme, never age) and a
    // numeric band (from the grade/range at the chosen granularity) so a manually-created
    // class participates in placement exactly like an auto-created one.
    {
      const rangeSource = String(body.grade ?? body.section ?? body.range ?? insertRow.qa_grade_band ?? '');
      let progName: string | null = null;
      if (insertRow.program_id) {
        const { data: prog } = await admin.from('programs').select('name').eq('id', insertRow.program_id as string).maybeSingle();
        progName = (prog as { name?: string } | null)?.name ?? null;
      }
      // Teacher-chosen granularity: 'single' (one grade) or 'fixed' (banded, default).
      const granularity = body.band_granularity === 'single' ? 'single' : 'fixed';
      const band = bandForGrade(rangeSource, granularity) || parseBandLabel(rangeSource);
      const tier = canonicalTier(progName);
      if (tier) insertRow.tier = tier;
      if (band) {
        insertRow.band_lvl = band.lvl;
        insertRow.band_low = band.low;
        insertRow.band_high = band.high;
        insertRow.qa_grade_band = band.label;
      } else if (rangeSource) {
        const legacy = gradeBand(rangeSource) || formatGradeRange(parseGrades(rangeSource));
        if (legacy) insertRow.qa_grade_band = legacy;
      }

      // Compose "School · Programme · Band" whenever a programme is chosen — ENFORCED: a
      // free-typed name is ignored so every programme class follows one convention. Works
      // without a school too (independent/online → "Programme · Band").
      if (progName && (!insertRow.name || body.auto_name || insertRow.program_id)) {
        let schoolName = '';
        if (insertRow.school_id) {
          const { data: sch } = await admin.from('schools').select('name').eq('id', insertRow.school_id as string).maybeSingle();
          schoolName = (sch as { name?: string } | null)?.name ?? '';
        }
        const built = buildClassName({ schoolName, programme: progName, range: band?.label || (insertRow.qa_grade_band as string) || null, online: /online/i.test(schoolName) });
        if (built) insertRow.name = built;
      }
    }
    if (!insertRow.name && insertRow.program_id) {
      return NextResponse.json({ error: 'Could not resolve the programme to compose a class name.' }, { status: 400 });
    }
    if (!insertRow.name) {
      return NextResponse.json({ error: 'Class name is required' }, { status: 400 });
    }
    insertRow.name = cleanClassName(String(insertRow.name));
    if (!insertRow.name) {
      return NextResponse.json({ error: 'Class name is required' }, { status: 400 });
    }

    // Resolve a live session when none was supplied so create/reuse stay year+term scoped.
    if (!insertRow.term_id) {
      try {
        const { liveAcademicSession } = await import('@/lib/reports/academic-period');
        const live = liveAcademicSession();
        const { data: liveTerm } = await admin
          .from('academic_terms')
          .select('id, start_date, end_date')
          .eq('academic_year', live.periodLabel)
          .eq('term_label', live.termLabel)
          .maybeSingle();
        if ((liveTerm as any)?.id) {
          insertRow.term_id = (liveTerm as any).id;
          if (!insertRow.start_date && (liveTerm as any).start_date) insertRow.start_date = (liveTerm as any).start_date;
          if (!insertRow.end_date && (liveTerm as any).end_date) insertRow.end_date = (liveTerm as any).end_date;
        }
      } catch { /* academic_terms optional */ }
    }

    let existingQuery = admin
      .from('classes')
      .select()
      .eq('school_id', insertRow.school_id as string)
      .eq('name', String(insertRow.name));
    // Never reuse a same-named class across different academic sessions.
    if (insertRow.term_id) {
      existingQuery = existingQuery.eq('term_id', insertRow.term_id as string);
    } else {
      existingQuery = existingQuery.is('term_id', null);
    }
    const { data: existingClass } = await existingQuery.limit(1).maybeSingle();
    if (existingClass) {
      if ((existingClass as any).teacher_id && (existingClass as any).teacher_id !== insertRow.teacher_id) {
        const { data: owner } = await admin
          .from('portal_users')
          .select('full_name')
          .eq('id', (existingClass as any).teacher_id)
          .maybeSingle();
        const ownerName = (owner as { full_name?: string } | null)?.full_name || 'another teacher';
        return NextResponse.json(
          { error: `A class named "${(existingClass as any).name}" already exists for this term and is owned by ${ownerName}.` },
          { status: 400 }
        );
      }
      const reuseUpdate: Record<string, unknown> = {};
      if (!(existingClass as any).teacher_id && insertRow.teacher_id) {
        reuseUpdate.teacher_id = insertRow.teacher_id;
      }
      if (insertRow.current_course_id && (existingClass as any).current_course_id !== insertRow.current_course_id) {
        reuseUpdate.current_course_id = insertRow.current_course_id;
      }
      if (Object.keys(reuseUpdate).length > 0) {
        reuseUpdate.updated_at = new Date().toISOString();
        await admin
          .from('classes')
          .update(reuseUpdate)
          .eq('id', (existingClass as any).id);
        Object.assign(existingClass as any, reuseUpdate);
      }
      const { error: pathwayError } = await (admin as any).rpc('ensure_class_academic_pathway', {
        p_class_id: (existingClass as any).id,
        p_enrollment_type: enrollmentType,
        p_preferred_offering_id: preferredOfferingId,
        p_actor_id: caller.id,
      });
      if (pathwayError) return NextResponse.json({ error: pathwayError.message }, { status: 409 });
      const { data: fusedClass } = await admin.from('classes').select().eq('id', (existingClass as any).id).single();
      prepareAcademicClass((existingClass as any).id);
      return NextResponse.json({ data: fusedClass ?? existingClass, reused: true }, { status: 200 });
    }

    const { data, error } = await admin
      .from('classes')
      .insert(insertRow)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { error: pathwayError } = await (admin as any).rpc('ensure_class_academic_pathway', {
      p_class_id: (data as any).id,
      p_enrollment_type: enrollmentType,
      p_preferred_offering_id: preferredOfferingId,
      p_actor_id: caller.id,
    });
    if (pathwayError) {
      await admin.from('classes').delete().eq('id', (data as any).id);
      return NextResponse.json({ error: pathwayError.message }, { status: 409 });
    }
    const { data: fusedClass } = await admin.from('classes').select().eq('id', (data as any).id).single();
    prepareAcademicClass((data as any).id);

    await logAudit(admin as any, {
      action: 'create_class',
      actorId: caller.id,
      resourceType: 'class',
      resourceId: (data as any)?.id ?? null,
      newValue: (data as any)?.name ?? null,
    });
    return NextResponse.json({ data: fusedClass ?? data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
