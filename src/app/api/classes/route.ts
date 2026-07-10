import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildClassName, parseGrades, formatGradeRange, gradeBand, bandForGrade, parseBandLabel, canonicalTier } from '@/lib/classes/naming';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
        start_date, end_date, schedule, teacher_id, program_id, school_id, term_id, created_at,
        qa_grade_key, qa_track_hint, qa_spine_lane,
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
        query = query.eq('teacher_id', caller.id) as any;
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

    // Fall back to the DB-synced current_students when live count is still 0
    // (covers program-enrolled students not yet healed by the detail page)
    const enriched = classData.map((c: any) => ({
      ...c,
      current_students: countMap[c.id] || c.current_students || 0,
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

    // ── Field whitelist — never trust raw body ────────────────────────────────
    const insertRow: Record<string, unknown> = {};
    const allowedFields = ['name', 'description', 'program_id', 'max_students', 'status', 'schedule', 'start_date', 'end_date', 'term_id'];
    for (const f of allowedFields) {
      if (f in body && body[f] != null) insertRow[f] = body[f];
    }

    if (!insertRow.name && !insertRow.program_id) {
      return NextResponse.json({ error: 'A class name, or a programme to auto-name it, is required' }, { status: 400 });
    }

    const admin = adminClient();

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
      if ('teacher_id' in body) insertRow.teacher_id = body.teacher_id ?? null;
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

    const { data: existingClass } = await admin
      .from('classes')
      .select()
      .eq('school_id', insertRow.school_id as string)
      .eq('name', String(insertRow.name))
      .maybeSingle();
    if (existingClass) {
      if (!(existingClass as any).teacher_id && insertRow.teacher_id) {
        await admin
          .from('classes')
          .update({ teacher_id: insertRow.teacher_id, updated_at: new Date().toISOString() })
          .eq('id', (existingClass as any).id);
        (existingClass as any).teacher_id = insertRow.teacher_id;
      }
      return NextResponse.json({ data: existingClass, reused: true }, { status: 200 });
    }

    const { data, error } = await admin
      .from('classes')
      .insert(insertRow)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(admin as any, {
      action: 'create_class',
      actorId: caller.id,
      resourceType: 'class',
      resourceId: (data as any)?.id ?? null,
      newValue: (data as any)?.name ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
