import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// GET /api/classes/heal?search=... — search students for manual reassign
// GET /api/classes/heal — scan for anomalies
export async function GET(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const db = adminClient();

  // Teacher audit: full breakdown of a teacher's schools, classes, and displaced students.
  // Used by the heal UI to show a per-school picture without making the admin guess.
  const teacherAuditId = req.nextUrl.searchParams.get('teacher_audit');
  if (teacherAuditId) {
    // 1. Resolve teacher's assigned schools
    const { data: tsRows } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherAuditId);
    const { data: tProfile } = await db.from('portal_users').select('school_id, school_name, full_name').eq('id', teacherAuditId).single();
    const assignedSchoolIds = [...new Set([
      ...((tsRows ?? []).map((r: any) => r.school_id).filter(Boolean)),
      ...(tProfile?.school_id ? [tProfile.school_id] : []),
    ])] as string[];

    // 2. Get all schools info
    const { data: schoolRows } = assignedSchoolIds.length > 0
      ? await db.from('schools').select('id, name').in('id', assignedSchoolIds)
      : { data: [] };
    const schoolNameMap: Record<string, string> = {};
    (schoolRows ?? []).forEach((s: any) => { schoolNameMap[s.id] = s.name; });

    // 3. Get teacher's classes across all schools
    const { data: teacherClasses } = await db
      .from('classes')
      .select('id, name, school_id')
      .eq('teacher_id', teacherAuditId);

    // Collect all relevant school IDs (assigned + where classes exist)
    const allRelevantSchoolIds = [...new Set([
      ...assignedSchoolIds,
      ...((teacherClasses ?? []).map((c: any) => c.school_id).filter(Boolean)),
    ])] as string[];

    // Enrich school names for class-only schools
    if (allRelevantSchoolIds.length > assignedSchoolIds.length) {
      const extra = allRelevantSchoolIds.filter(id => !schoolNameMap[id]);
      if (extra.length > 0) {
        const { data: extraSchools } = await db.from('schools').select('id, name').in('id', extra);
        (extraSchools ?? []).forEach((s: any) => { schoolNameMap[s.id] = s.name; });
      }
    }

    // 4. Students currently in teacher's classes
    const classIds = (teacherClasses ?? []).map((c: any) => c.id);
    const { data: classStudents } = classIds.length > 0
      ? await db.from('portal_users').select('id, full_name, email, school_id, class_id, section_class').in('class_id', classIds).eq('role', 'student').eq('is_deleted', false)
      : { data: [] };

    const classStudentIdSet = new Set((classStudents ?? []).map((s: any) => s.id));

    // 5a. Students who have reports authored by this teacher but are NOT in their class
    const { data: rptRows } = await db.from('student_progress_reports').select('student_id').eq('teacher_id', teacherAuditId).not('student_id', 'is', null);
    const rptStudentIds = [...new Set((rptRows ?? []).map((r: any) => r.student_id).filter(Boolean))] as string[];
    const reportDisplacedIds = new Set(rptStudentIds.filter(id => !classStudentIdSet.has(id)));

    // 5b. Students originally registered BY this teacher (batch creator) who are NOT in their class.
    // This catches new students with no reports yet — the batch creator is who brought them in.
    const { data: teacherBatches } = await db
      .from('registration_batches')
      .select('id')
      .eq('created_by', teacherAuditId);
    const teacherBatchIds = (teacherBatches ?? []).map((b: any) => b.id);
    const batchDisplacedIds = new Set<string>();
    if (teacherBatchIds.length > 0) {
      const { data: batchResultRows } = await db
        .from('registration_results')
        .select('email')
        .in('batch_id', teacherBatchIds);
      const batchEmails = [...new Set((batchResultRows ?? []).map((r: any) => r.email?.toLowerCase()).filter(Boolean))];
      if (batchEmails.length > 0) {
        const { data: batchStudentRows } = await db
          .from('portal_users')
          .select('id')
          .in('email', batchEmails)
          .eq('role', 'student')
          .eq('is_deleted', false);
        (batchStudentRows ?? []).forEach((s: any) => {
          if (!classStudentIdSet.has(s.id)) batchDisplacedIds.add(s.id);
        });
      }
    }

    // 5c. Students whose official registry record (students table) was created by this teacher.
    // This captures individual registrations made outside the CSV batch flow.
    // students.created_by is set on every POST /api/students call.
    const { data: createdByRows } = await db
      .from('students')
      .select('user_id')
      .eq('created_by', teacherAuditId)
      .not('user_id', 'is', null);
    const registeredByIds = new Set<string>();
    (createdByRows ?? []).forEach((s: any) => {
      if (s.user_id && !classStudentIdSet.has(s.user_id)) registeredByIds.add(s.user_id);
    });

    // Union of all three displacement signals — tag each student with what flagged them
    const allDisplacedIds = [...new Set([...reportDisplacedIds, ...batchDisplacedIds, ...registeredByIds])];
    const displacementSources = new Map<string, string[]>();
    reportDisplacedIds.forEach(id => { displacementSources.set(id, [...(displacementSources.get(id) ?? []), 'report_authored']); });
    batchDisplacedIds.forEach(id => { displacementSources.set(id, [...(displacementSources.get(id) ?? []), 'batch_registered']); });
    registeredByIds.forEach(id => { displacementSources.set(id, [...(displacementSources.get(id) ?? []), 'registered_by']); });

    const { data: displacedStudents } = allDisplacedIds.length > 0
      ? await db.from('portal_users').select('id, full_name, email, school_id, school_name, class_id, section_class').in('id', allDisplacedIds).eq('role', 'student').eq('is_deleted', false)
      : { data: [] };

    // Enrich displaced with current class name and its teacher name
    const dispClassIds = [...new Set((displacedStudents ?? []).map((s: any) => s.class_id).filter(Boolean))];
    let dispClassMap: Record<string, { name: string; teacher_id: string | null; teacher_name: string | null }> = {};
    if (dispClassIds.length > 0) {
      const { data: dispClasses } = await db.from('classes').select('id, name, teacher_id').in('id', dispClassIds);
      const dispTeacherIds = [...new Set((dispClasses ?? []).map((c: any) => c.teacher_id).filter(Boolean))];
      let dispTeacherNames: Record<string, string> = {};
      if (dispTeacherIds.length > 0) {
        const { data: dtRows } = await db.from('portal_users').select('id, full_name').in('id', dispTeacherIds);
        (dtRows ?? []).forEach((t: any) => { dispTeacherNames[t.id] = t.full_name; });
      }
      (dispClasses ?? []).forEach((c: any) => {
        dispClassMap[c.id] = { name: c.name, teacher_id: c.teacher_id, teacher_name: c.teacher_id ? (dispTeacherNames[c.teacher_id] ?? null) : null };
      });
    }

    const enrichedDisplaced = (displacedStudents ?? []).map((s: any) => ({
      ...s,
      current_class_name: s.class_id ? (dispClassMap[s.class_id]?.name ?? s.section_class ?? null) : null,
      current_class_teacher_name: s.class_id ? (dispClassMap[s.class_id]?.teacher_name ?? null) : null,
      // How we know this student belongs here: 'report_authored', 'batch_registered', or both
      displacement_sources: displacementSources.get(s.id) ?? [],
    }));

    // Build per-school structure
    const schoolAudit = allRelevantSchoolIds.map(sid => ({
      school_id: sid,
      school_name: schoolNameMap[sid] ?? sid,
      in_teacher_schools: assignedSchoolIds.includes(sid),
      classes: (teacherClasses ?? []).filter((c: any) => c.school_id === sid).map((c: any) => ({
        ...c,
        student_count: (classStudents ?? []).filter((s: any) => s.class_id === c.id).length,
      })),
      students_in_classes: (classStudents ?? []).filter((s: any) => s.school_id === sid),
      displaced_students: enrichedDisplaced.filter((s: any) => s.school_id === sid),
    }));

    return NextResponse.json({ data: { teacher_name: tProfile?.full_name ?? null, schoolAudit, allClasses: teacherClasses ?? [] } });
  }

  const q = req.nextUrl.searchParams.get('search');
  if (q !== null) {
    const term = q.trim();
    if (!term) return NextResponse.json({ data: [] });
    const { data: students } = await db
      .from('portal_users')
      .select('id, full_name, email, school_id, school_name, class_id, section_class')
      .eq('role', 'student')
      .eq('is_deleted', false)
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .order('full_name')
      .limit(30);
    // Enrich each student with their class name
    const classIds = [...new Set((students ?? []).map((s: any) => s.class_id).filter(Boolean))];
    let classNameMap: Record<string, string> = {};
    if (classIds.length) {
      const { data: classes } = await db.from('classes').select('id, name').in('id', classIds);
      (classes ?? []).forEach((c: any) => { classNameMap[c.id] = c.name; });
    }
    const rows = (students ?? []).map((s: any) => ({
      ...s,
      class_name: s.class_id ? (classNameMap[s.class_id] ?? s.section_class ?? null) : null,
    }));
    return NextResponse.json({ data: rows });
  }

  // 1. Students with no school_id — cross-check against students registry
  const { data: noSchoolRaw } = await db
    .from('portal_users')
    .select('id, full_name, email, class_id, school_id, section_class')
    .eq('role', 'student')
    .is('school_id', null)
    .eq('is_deleted', false);

  // Look up registry records for each no-school student
  const noSchoolIds = (noSchoolRaw ?? []).map((s: any) => s.id);
  let registryMap: Record<string, { school_id: string | null; school_name: string | null; section: string | null; grade_level: string | null; status: string | null }> = {};
  if (noSchoolIds.length > 0) {
    const { data: regRows } = await db
      .from('students')
      .select('user_id, school_id, school_name, section, grade_level, status')
      .in('user_id', noSchoolIds);
    (regRows ?? []).forEach((r: any) => {
      if (r.user_id) registryMap[r.user_id] = {
        school_id: r.school_id ?? null,
        school_name: r.school_name ?? null,
        section: r.section ?? null,
        grade_level: r.grade_level ?? null,
        status: r.status ?? null,
      };
    });
  }

  const noSchool = (noSchoolRaw ?? []).map((s: any) => ({
    ...s,
    registry: registryMap[s.id] ?? null,
  }));

  // 2. Students with no class_id
  const { data: noClass } = await db
    .from('portal_users')
    .select('id, full_name, email, class_id, school_id, section_class, school_name')
    .eq('role', 'student')
    .is('class_id', null)
    .not('school_id', 'is', null)
    .eq('is_deleted', false);

  // 3. Students whose class belongs to a different school than their school_id
  const { data: allStudents } = await db
    .from('portal_users')
    .select('id, full_name, email, school_id, class_id, school_name')
    .eq('role', 'student')
    .not('school_id', 'is', null)
    .not('class_id', 'is', null)
    .eq('is_deleted', false);

  const { data: allClasses } = await db
    .from('classes')
    .select('id, name, school_id, teacher_id');

  const classSchoolMap: Record<string, string | null> = {};
  const classTeacherMap: Record<string, string | null> = {};
  const classNameMap2: Record<string, string> = {};
  (allClasses ?? []).forEach((c: any) => {
    classSchoolMap[c.id] = c.school_id;
    classTeacherMap[c.id] = c.teacher_id ?? null;
    classNameMap2[c.id] = c.name;
  });

  // Build report-author map for ALL students with a class — used for both
  // school-mismatch enrichment and teacher-conflict detection below.
  const studentsWithClass = allStudents ?? [];
  const reportTeacherMap: Record<string, string> = {};
  if (studentsWithClass.length > 0) {
    const allSids = studentsWithClass.map((s: any) => s.id);
    const { data: allRpts } = await db
      .from('student_progress_reports')
      .select('student_id, teacher_id')
      .in('student_id', allSids)
      .not('teacher_id', 'is', null);
    const rptCounts: Record<string, Record<string, number>> = {};
    (allRpts ?? []).forEach((r: any) => {
      if (!r.student_id || !r.teacher_id) return;
      if (!rptCounts[r.student_id]) rptCounts[r.student_id] = {};
      rptCounts[r.student_id][r.teacher_id] = (rptCounts[r.student_id][r.teacher_id] || 0) + 1;
    });
    for (const [sid, tc] of Object.entries(rptCounts)) {
      const top = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
      if (top) reportTeacherMap[sid] = top[0];
    }
  }

  // 3a. Enrich mismatched with class name, class school, and conflict flag
  const rawMismatched = (allStudents ?? []).filter((s: any) => {
    const classSchool = classSchoolMap[s.class_id];
    return classSchool && classSchool !== s.school_id;
  });

  // Fetch school names for the class school IDs that appear in mismatches
  const mismatchClassSchoolIds = [...new Set(rawMismatched.map((s: any) => classSchoolMap[s.class_id]).filter(Boolean))] as string[];
  let mismatchSchoolNames: Record<string, string> = {};
  if (mismatchClassSchoolIds.length > 0) {
    const { data: mSchools } = await db.from('schools').select('id, name').in('id', mismatchClassSchoolIds);
    (mSchools ?? []).forEach((s: any) => { mismatchSchoolNames[s.id] = s.name; });
  }

  const mismatched = rawMismatched.map((s: any) => {
    const clsSchoolId = classSchoolMap[s.class_id] ?? null;
    const clsTeacherId = classTeacherMap[s.class_id] ?? null;
    const reportTeacherId = reportTeacherMap[s.id] ?? null;
    return {
      ...s,
      class_name: classNameMap2[s.class_id] ?? null,
      class_school_id: clsSchoolId,
      class_school_name: mismatchSchoolNames[clsSchoolId ?? ''] ?? null,
      // When true: class assignment is suspect — align will be skipped for this student.
      // Use the Teacher Conflict section to fix the class first.
      class_teacher_conflict: !!(clsTeacherId && reportTeacherId && clsTeacherId !== reportTeacherId),
    };
  });

  // 5. Teacher–class conflict: students whose class is owned by Teacher A but whose
  //    progress reports were authored primarily by Teacher B. Surfaces the
  //    "Sulemani overwrote Amaka's students" scenario.
  let teacherConflict: any[] = [];
  if (studentsWithClass.length > 0) {
    const conflictRaw = studentsWithClass.filter((s: any) => {
      const ct = classTeacherMap[s.class_id];
      const rt = reportTeacherMap[s.id];  // already computed above
      return ct && rt && ct !== rt;
    });

    // Enrich with teacher names
    const teacherIdSet = new Set<string>();
    conflictRaw.forEach((s: any) => {
      const ct = classTeacherMap[s.class_id];
      const rt = reportTeacherMap[s.id];
      if (ct) teacherIdSet.add(ct);
      if (rt) teacherIdSet.add(rt);
    });
    let teacherNameMap: Record<string, string> = {};
    if (teacherIdSet.size > 0) {
      const { data: teachers } = await db.from('portal_users').select('id, full_name').in('id', Array.from(teacherIdSet));
      (teachers ?? []).forEach((t: any) => { teacherNameMap[t.id] = t.full_name; });
    }

    teacherConflict = conflictRaw.map((s: any) => ({
      ...s,
      current_class_name: classNameMap2[s.class_id] ?? null,
      current_class_teacher_id: classTeacherMap[s.class_id] ?? null,
      current_class_teacher_name: teacherNameMap[classTeacherMap[s.class_id] ?? ''] ?? null,
      report_teacher_id: reportTeacherMap[s.id] ?? null,
      report_teacher_name: teacherNameMap[reportTeacherMap[s.id] ?? ''] ?? null,
    }));
  }

  // 4. Classes with no students and no lesson plans
  const { data: emptyClasses } = await db
    .from('classes')
    .select('id, name, school_id, created_at, schools(name)')
    .not('school_id', 'is', null);

  const { data: classStudentCounts } = await db
    .from('portal_users')
    .select('class_id')
    .eq('role', 'student')
    .not('class_id', 'is', null);

  const { data: classLessonPlanCounts } = await db
    .from('lesson_plans')
    .select('class_id')
    .not('class_id', 'is', null);

  const classHasStudents = new Set((classStudentCounts ?? []).map((r: any) => r.class_id));
  const classHasLessons = new Set((classLessonPlanCounts ?? []).map((r: any) => r.class_id));

  const orphanClasses = (emptyClasses ?? []).filter(
    (c: any) => !classHasStudents.has(c.id) && !classHasLessons.has(c.id),
  );

  // 6. Teachers whose classes reference a school_id not in their teacher_schools table.
  //    This is why Amaka's "other school" students disappear — the scoping query
  //    only includes schools from teacher_schools, so a missing row hides everything.
  const { data: allTeacherClasses } = await db
    .from('classes')
    .select('id, name, school_id, teacher_id')
    .not('teacher_id', 'is', null)
    .not('school_id', 'is', null);

  const { data: existingTsRows } = await db
    .from('teacher_schools')
    .select('teacher_id, school_id');

  const existingTsSet = new Set<string>(
    (existingTsRows ?? []).map((r: any) => `${r.teacher_id}::${r.school_id}`)
  );

  // Collect missing teacher_schools entries
  const missingTsMap: Record<string, { teacher_id: string; school_id: string; class_ids: string[] }> = {};
  (allTeacherClasses ?? []).forEach((c: any) => {
    const key = `${c.teacher_id}::${c.school_id}`;
    if (!existingTsSet.has(key)) {
      if (!missingTsMap[key]) missingTsMap[key] = { teacher_id: c.teacher_id, school_id: c.school_id, class_ids: [] };
      missingTsMap[key].class_ids.push(c.id);
    }
  });

  // Enrich with teacher and school names
  const missingTs = Object.values(missingTsMap);
  let teacherSchoolNameMap: Record<string, string> = {};
  let schoolNameMap2: Record<string, string> = {};
  if (missingTs.length > 0) {
    const missingTeacherIds = [...new Set(missingTs.map(m => m.teacher_id))];
    const missingSchoolIds = [...new Set(missingTs.map(m => m.school_id))];
    const [tRows, sRows] = await Promise.all([
      db.from('portal_users').select('id, full_name').in('id', missingTeacherIds),
      db.from('schools').select('id, name').in('id', missingSchoolIds),
    ]);
    (tRows.data ?? []).forEach((t: any) => { teacherSchoolNameMap[t.id] = t.full_name; });
    (sRows.data ?? []).forEach((s: any) => { schoolNameMap2[s.id] = s.name; });
  }

  const missingTeacherSchools = missingTs.map(m => ({
    ...m,
    teacher_name: teacherSchoolNameMap[m.teacher_id] ?? null,
    school_name: schoolNameMap2[m.school_id] ?? null,
  }));

  // Load teachers list for UI
  const { data: teacherRows } = await db
    .from('portal_users')
    .select('id, full_name')
    .eq('role', 'teacher')
    .eq('is_deleted', false)
    .order('full_name');

  return NextResponse.json({
    data: {
      noSchool: noSchool ?? [],
      noClass: noClass ?? [],
      mismatched,
      sectionDrift: [],
      orphanClasses,
      teacherConflict,
      missingTeacherSchools,
      classes: allClasses ?? [],
      teachers: teacherRows ?? [],
    },
  });
}

// POST /api/classes/heal — apply a fix action
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { action, studentIds, classId, schoolId, deleteClassId } = body;
  const db = adminClient();

  if (action === 'assign_class') {
    // Assign students to a class and set school_id from that class
    if (!classId || !studentIds?.length) {
      return NextResponse.json({ error: 'classId and studentIds required' }, { status: 400 });
    }
    const { data: cls } = await db.from('classes').select('school_id, name').eq('id', classId).single();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    const { error } = await db
      .from('portal_users')
      .update({ class_id: classId, school_id: cls.school_id, section_class: cls.name })
      .in('id', studentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'assign_school') {
    if (!schoolId || !studentIds?.length) {
      return NextResponse.json({ error: 'schoolId and studentIds required' }, { status: 400 });
    }
    const { data: school } = await db.from('schools').select('name').eq('id', schoolId).single();
    const { error } = await db
      .from('portal_users')
      .update({ school_id: schoolId, school_name: school?.name ?? null })
      .in('id', studentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'safe_auto_repair') {
    // Assign class_id to students who have no class but section_class exactly matches
    // a class name at their school — uses the student's own registration data as the signal.
    // Does NOT touch section_class text; class names are program-based and may differ from
    // a student's grade/section label (e.g. "Python SS2" class with SS1+SS2 students is valid).
    const { data: allClasses } = await db.from('classes').select('id, name, school_id');
    const classNameMap: Record<string, string> = {};
    const sectionToClass: Record<string, string> = {};
    (allClasses ?? []).forEach((c: any) => {
      classNameMap[c.id] = c.name;
      if (c.school_id && c.name) sectionToClass[`${c.school_id}::${c.name}`] = c.id;
    });

    const { data: noClassStudents } = await db
      .from('portal_users')
      .select('id, school_id, section_class')
      .eq('role', 'student')
      .is('class_id', null)
      .not('school_id', 'is', null)
      .not('section_class', 'is', null)
      .eq('is_deleted', false);

    let classAssigned = 0;
    for (const s of (noClassStudents ?? [])) {
      const key = `${s.school_id}::${s.section_class}`;
      const matchedClassId = sectionToClass[key];
      if (matchedClassId) {
        await db.from('portal_users')
          .update({ class_id: matchedClassId })
          .eq('id', s.id);
        classAssigned++;
      }
    }

    return NextResponse.json({
      success: true,
      driftFixed: 0,
      classAssigned,
      updated: classAssigned,
    });
  }

  if (action === 'delete_portal_user') {
    // Soft-delete a portal user (marks is_deleted, does not remove auth)
    if (!studentIds?.length) return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    const { error } = await db
      .from('portal_users')
      .update({ is_deleted: true, is_active: false })
      .in('id', studentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: studentIds.length });
  }

  if (action === 'sync_from_registry') {
    // For students with no school_id, apply the school from their students registry record
    if (!studentIds?.length) return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    const { data: regRows } = await db
      .from('students')
      .select('user_id, school_id, school_name, section')
      .in('user_id', studentIds)
      .not('school_id', 'is', null);
    let synced = 0;
    for (const r of (regRows ?? [])) {
      if (!r.user_id || !r.school_id) continue;
      await db.from('portal_users').update({
        school_id: r.school_id,
        school_name: r.school_name ?? null,
        section_class: r.section ?? null,
      }).eq('id', r.user_id);
      synced++;
    }
    return NextResponse.json({ success: true, updated: synced });
  }

  if (action === 'delete_class') {
    if (!deleteClassId) return NextResponse.json({ error: 'deleteClassId required' }, { status: 400 });
    const { error } = await db.from('classes').delete().eq('id', deleteClassId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Add missing teacher_schools entries for a specific teacher (or all teachers).
  // This fixes the "other school students disappeared" scenario where a teacher
  // owns classes at a school but has no teacher_schools row for it.
  if (action === 'sync_teacher_schools') {
    const { teacherId } = body; // optional — if omitted, repairs all teachers
    let q = db.from('classes').select('teacher_id, school_id').not('teacher_id', 'is', null).not('school_id', 'is', null);
    if (teacherId) q = q.eq('teacher_id', teacherId) as any;
    const { data: clsRows } = await q;

    const { data: existingTs } = await db.from('teacher_schools').select('teacher_id, school_id');
    const tsSet = new Set<string>((existingTs ?? []).map((r: any) => `${r.teacher_id}::${r.school_id}`));

    const toInsert: { teacher_id: string; school_id: string }[] = [];
    for (const c of (clsRows ?? [])) {
      const key = `${c.teacher_id}::${c.school_id}`;
      if (!tsSet.has(key)) {
        toInsert.push({ teacher_id: c.teacher_id, school_id: c.school_id });
        tsSet.add(key); // dedup within this run
      }
    }

    if (toInsert.length === 0) return NextResponse.json({ updated: 0, message: 'All teacher_schools entries already exist' });
    const { error } = await db.from('teacher_schools').insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: toInsert.length });
  }

  // Restore students to the correct teacher's class.
  // Finds every student who has a progress report authored by `teacherId` but
  // whose current class is owned by a different teacher, then moves them to `classId`.
  if (action === 'restore_by_reports') {
    // ── SAFE VERSION ────────────────────────────────────────────────────────
    // Only moves students who:
    //   1. Have a report authored by teacherId
    //   2. Currently have a class_id pointing to someone else's class
    //   3. Belong to the SAME school as the destination class (school boundary)
    // Does NOT touch students with no class, and does NOT cross school lines.
    const { teacherId, classId } = body;
    if (!teacherId || !classId) return NextResponse.json({ error: 'teacherId and classId required' }, { status: 400 });

    const { data: cls } = await db.from('classes').select('school_id, name').eq('id', classId).single();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // Students with reports authored by this teacher
    const { data: reports } = await db
      .from('student_progress_reports')
      .select('student_id')
      .eq('teacher_id', teacherId)
      .not('student_id', 'is', null);
    const reportStudentIds = [...new Set((reports ?? []).map((r: any) => r.student_id).filter(Boolean))];
    if (reportStudentIds.length === 0) return NextResponse.json({ updated: 0, message: 'No students found with reports by this teacher' });

    // Fetch students: must have class_id AND school_id must match destination class school
    const { data: students } = await db
      .from('portal_users')
      .select('id, class_id, school_id')
      .in('id', reportStudentIds)
      .eq('role', 'student')
      .eq('school_id', cls.school_id) // ← school boundary guard
      .not('class_id', 'is', null);   // ← only students already in a class

    const classIds = [...new Set((students ?? []).map((s: any) => s.class_id).filter(Boolean))];
    const cTeacherMap: Record<string, string | null> = {};
    if (classIds.length > 0) {
      const { data: classes } = await db.from('classes').select('id, teacher_id').in('id', classIds);
      (classes ?? []).forEach((c: any) => { cTeacherMap[c.id] = c.teacher_id; });
    }

    // Only move students whose current class is owned by a DIFFERENT teacher
    const toMove = (students ?? [])
      .filter((s: any) => cTeacherMap[s.class_id] !== teacherId)
      .map((s: any) => s.id);
    if (toMove.length === 0) return NextResponse.json({ updated: 0, message: 'All students already in this teacher\'s class' });

    const { error } = await db.from('portal_users')
      .update({ class_id: classId, school_id: cls.school_id, section_class: cls.name, updated_at: new Date().toISOString() })
      .in('id', toMove);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, updated: toMove.length });
  }

  // Auto-align: scan all students and, for each one whose current class teacher
  // doesn't match their primary report teacher, move them to a class owned by
  // their report teacher at the same school.
  if (action === 'auto_align_by_reports') {
    const { data: students } = await db
      .from('portal_users')
      .select('id, school_id, class_id')
      .eq('role', 'student')
      .not('class_id', 'is', null)
      .eq('is_deleted', false);

    const cids = [...new Set((students ?? []).map((s: any) => s.class_id).filter(Boolean))];
    const cMap: Record<string, { teacher_id: string | null; school_id: string | null; name: string }> = {};

    const { data: allCls } = await db.from('classes').select('id, teacher_id, school_id, name');
    (allCls ?? []).forEach((c: any) => { cMap[c.id] = { teacher_id: c.teacher_id, school_id: c.school_id, name: c.name }; });

    // Build teacher→school→classId index
    const teacherSchoolClass: Record<string, string> = {}; // `${teacherId}::${schoolId}` => first classId
    (allCls ?? []).forEach((c: any) => {
      if (!c.teacher_id || !c.school_id) return;
      const key = `${c.teacher_id}::${c.school_id}`;
      if (!teacherSchoolClass[key]) teacherSchoolClass[key] = c.id;
    });

    // Get primary report teacher per student
    const sids = (students ?? []).map((s: any) => s.id);
    const { data: rpts } = await db.from('student_progress_reports').select('student_id, teacher_id').in('student_id', sids).not('teacher_id', 'is', null);
    const rptCounts: Record<string, Record<string, number>> = {};
    (rpts ?? []).forEach((r: any) => {
      if (!rptCounts[r.student_id]) rptCounts[r.student_id] = {};
      rptCounts[r.student_id][r.teacher_id] = (rptCounts[r.student_id][r.teacher_id] || 0) + 1;
    });
    const rptTeacher: Record<string, string> = {};
    for (const [sid, tc] of Object.entries(rptCounts)) {
      const top = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
      if (top) rptTeacher[sid] = top[0];
    }

    let moved = 0;
    for (const s of (students ?? [])) {
      const classTeacher = cMap[s.class_id]?.teacher_id;
      const classSchool = cMap[s.class_id]?.school_id;
      const reportTeacher = rptTeacher[s.id];
      if (!classTeacher || !reportTeacher || classTeacher === reportTeacher) continue;

      // Destination must be at the SAME school as the student — no cross-school moves
      const key = `${reportTeacher}::${s.school_id}`;
      const destClassId = teacherSchoolClass[key];
      if (!destClassId) continue;

      const destCls = cMap[destClassId];
      if (!destCls || destCls.school_id !== s.school_id) continue; // extra school guard

      await db.from('portal_users').update({
        class_id: destClassId,
        school_id: destCls.school_id,
        section_class: destCls.name,
        updated_at: new Date().toISOString(),
      }).eq('id', s.id);
      moved++;
    }
    return NextResponse.json({ success: true, updated: moved });
  }

  // Direct assign: move a specific list of student IDs to a class.
  // Used by the Teacher Audit UI for per-school targeted restore.
  // Enforces school boundary — students whose school_id doesn't match are skipped.
  if (action === 'direct_assign') {
    const { classId: destClassId, studentIds: sids } = body;
    if (!destClassId || !sids?.length) return NextResponse.json({ error: 'classId and studentIds required' }, { status: 400 });
    const { data: cls } = await db.from('classes').select('school_id, name').eq('id', destClassId).single();
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

    // Verify school boundary — silently skip cross-school students
    const { data: eligible } = await db.from('portal_users')
      .select('id')
      .in('id', sids)
      .eq('school_id', cls.school_id)
      .eq('role', 'student');
    const eligibleIds = (eligible ?? []).map((s: any) => s.id);
    if (eligibleIds.length === 0) return NextResponse.json({ updated: 0, skipped: sids.length, message: 'No students match the class school' });

    const { error } = await db.from('portal_users')
      .update({ class_id: destClassId, section_class: cls.name, updated_at: new Date().toISOString() })
      .in('id', eligibleIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const skipped = sids.length - eligibleIds.length;
    return NextResponse.json({ success: true, updated: eligibleIds.length, skipped });
  }

  // Align school_id to match the student's current class school.
  // GUARD: skips students whose class teacher ≠ their primary report teacher —
  // those students are likely in the wrong class (batch-enroll overwrite).
  // Fix the class assignment in Teacher Conflict section first, then re-run.
  if (action === 'align_to_class_school') {
    if (!studentIds?.length) return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    const skippedConflict: string[] = [];
    let updated = 0;
    for (const sid of studentIds) {
      try {
        const { data: student } = await db.from('portal_users').select('class_id, full_name').eq('id', sid).single();
        if (!student?.class_id) continue;
        const { data: cls } = await db.from('classes').select('school_id, name, teacher_id').eq('id', student.class_id).single();
        if (!cls?.school_id) continue;
        // Report-author guard — same logic as fix-school-mismatch align_student
        if (cls.teacher_id) {
          const { data: rpts } = await db.from('student_progress_reports').select('teacher_id').eq('student_id', sid).not('teacher_id', 'is', null);
          const counts: Record<string, number> = {};
          (rpts ?? []).forEach((r: any) => { counts[r.teacher_id] = (counts[r.teacher_id] || 0) + 1; });
          const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          const primaryReportTeacher = top?.[0];
          if (primaryReportTeacher && primaryReportTeacher !== cls.teacher_id) {
            skippedConflict.push(student.full_name || sid);
            continue;
          }
        }
        const { data: school } = await db.from('schools').select('name').eq('id', cls.school_id).single();
        await db.from('portal_users').update({ school_id: cls.school_id, school_name: school?.name ?? null }).eq('id', sid);
        await db.from('students').update({ school_id: cls.school_id, school_name: school?.name ?? null }).eq('user_id', sid);
        updated++;
      } catch { /* skip individual failures */ }
    }
    return NextResponse.json({
      success: true,
      updated,
      skipped: skippedConflict.length > 0 ? skippedConflict : undefined,
      message: skippedConflict.length > 0
        ? `${skippedConflict.length} student(s) skipped — their class teacher doesn't match their report author. Fix the class assignment in Teacher Conflict first: ${skippedConflict.join(', ')}`
        : undefined,
    });
  }

  // Restore from batch registration history.
  // When a student has multiple batch records (registered + re-registered), prefers the
  // batch whose creator matches the student's primary report teacher.
  // GUARD: skips restoration if the target batch's class teacher ≠ report teacher.
  if (action === 'restore_from_history') {
    if (!studentIds?.length) return NextResponse.json({ error: 'studentIds required' }, { status: 400 });
    const { data: students } = await db.from('portal_users').select('id, email, full_name').in('id', studentIds);
    const emails = (students ?? []).map((s: any) => s.email?.toLowerCase()).filter(Boolean) as string[];

    const { data: histResults } = await db.from('registration_results').select('email, batch_id').in('email', emails);
    const batchIds = [...new Set((histResults ?? []).map((r: any) => r.batch_id))];
    const { data: batches } = await db.from('registration_batches').select('*').in('id', batchIds);
    const { data: allClasses } = await db.from('classes').select('id, name, school_id, teacher_id');
    const { data: allReports } = await db.from('student_progress_reports').select('student_id, teacher_id').in('student_id', studentIds).not('teacher_id', 'is', null);
    // students.created_by — who individually registered each student (fallback when no reports)
    const { data: studentRegistry } = await db.from('students').select('user_id, created_by').in('user_id', studentIds).not('created_by', 'is', null);
    const registryCreatorMap = new Map<string, string>((studentRegistry ?? []).map((r: any) => [r.user_id, r.created_by]));

    const batchMap = new Map((batches ?? []).map((b: any) => [b.id, b]));
    // email → [batch_ids] — a student may have been in multiple batches
    const emailBatchMap = new Map<string, string[]>();
    (histResults ?? []).forEach((r: any) => {
      const e = r.email.toLowerCase();
      const arr = emailBatchMap.get(e) || [];
      arr.push(r.batch_id);
      emailBatchMap.set(e, arr);
    });
    // Build primary report teacher per student
    const rptCounts = new Map<string, Map<string, number>>();
    (allReports ?? []).forEach((r: any) => {
      const tc = rptCounts.get(r.student_id) || new Map<string, number>();
      tc.set(r.teacher_id, (tc.get(r.teacher_id) || 0) + 1);
      rptCounts.set(r.student_id, tc);
    });
    const primaryRptTeacher = new Map<string, string>();
    for (const [sid, tc] of rptCounts.entries()) {
      const top = [...tc.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) primaryRptTeacher.set(sid, top[0]);
    }

    let updated = 0;
    const skippedConflict: string[] = [];
    const errors: string[] = [];

    for (const s of (students ?? [])) {
      const emailKey = s.email?.toLowerCase() || '';
      const candidateBatchIds = emailBatchMap.get(emailKey) || [];
      if (candidateBatchIds.length === 0) { errors.push(`No history for ${s.email}`); continue; }

      const reportTeacher = primaryRptTeacher.get(s.id);
      // Fallback ownership signal: students.created_by (used when no reports exist yet)
      const registryCreator = registryCreatorMap.get(s.id);
      // Effective teacher: prefer report author, fall back to registry creator
      const ownerTeacher = reportTeacher ?? registryCreator;

      // Pick batch: prefer one whose creator = owner teacher, then class teacher = owner teacher, else first
      let selectedBatch: any = null;
      for (const bid of candidateBatchIds) {
        const b = batchMap.get(bid);
        if (!b) continue;
        if (ownerTeacher && b.created_by === ownerTeacher) { selectedBatch = b; break; }
      }
      if (!selectedBatch) {
        for (const bid of candidateBatchIds) {
          const b = batchMap.get(bid);
          if (!b) continue;
          const bc = (allClasses ?? []).find((c: any) => c.id === b.class_id || (c.name === b.class_name && c.school_id === b.school_id));
          if (bc && ownerTeacher && bc.teacher_id === ownerTeacher) { selectedBatch = b; break; }
        }
      }
      if (!selectedBatch) selectedBatch = batchMap.get(candidateBatchIds[0]);
      if (!selectedBatch) { errors.push(`Batch not found for ${s.email}`); continue; }

      let targetClassId = selectedBatch.class_id;
      if (!targetClassId && selectedBatch.class_name && selectedBatch.school_id) {
        const mc = (allClasses ?? []).find((c: any) => c.school_id === selectedBatch.school_id && c.name === selectedBatch.class_name);
        if (mc) targetClassId = mc.id;
      }

      // Guard: target class teacher must match owner teacher (report author or registry creator)
      if (targetClassId && ownerTeacher) {
        const tc = (allClasses ?? []).find((c: any) => c.id === targetClassId);
        if (tc?.teacher_id && tc.teacher_id !== ownerTeacher) {
          skippedConflict.push(s.full_name || s.email || s.id);
          continue;
        }
      }

      const update = {
        school_id: selectedBatch.school_id,
        school_name: selectedBatch.school_name,
        class_id: targetClassId || null,
        section_class: selectedBatch.class_name || null,
      };
      await db.from('portal_users').update(update).eq('id', s.id);
      await db.from('students').update(update).eq('user_id', s.id);
      updated++;
    }

    return NextResponse.json({
      success: true,
      updated,
      errors: errors.length > 0 ? errors : undefined,
      skipped: skippedConflict.length > 0 ? skippedConflict : undefined,
      message: skippedConflict.length > 0
        ? `${skippedConflict.length} student(s) skipped — history points to a different teacher than their report author (likely an overwrite batch). Fix class assignment in Teacher Conflict first: ${skippedConflict.join(', ')}`
        : undefined,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
