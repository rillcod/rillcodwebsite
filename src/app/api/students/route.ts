import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { cleanStudentName, duplicateNameKey } from '@/lib/students/clean-name';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { cleanGrade } from '@/lib/classes/naming';
import { isAutoPortalsOn } from '@/lib/server/lms-policy';
import { isTeacherIsolationOn } from '@/lib/server/teacher-scope';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  const supabase = adminClient();
  const serverSupabase = await createServerClient();
  
  try {
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get caller's profile to verify school access
    const { data: caller } = await supabase
      .from('portal_users')
      .select('id, role, school_id')
      .eq('id', user.id)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
    }

    const body = await request.json();
    const primaryEmail = body.student_email || body.parent_email || body.studentEmail || body.parentEmail;
    const rawName = (body.full_name || body.fullName || '').trim();
    const fullName = cleanStudentName(rawName) || rawName; // canonical, noise-free name (matches bulk)
    const isForce = body.force === true;

    // 1. Check for duplicate email (Global) — only when an email was actually supplied,
    //    and limit(1) so a stray double-match never throws (maybeSingle errors on >1).
    if (primaryEmail) {
      const { data: emailMatches } = await supabase
        .from('students')
        .select('id, full_name, school_name')
        .or(`student_email.eq.${primaryEmail},parent_email.eq.${primaryEmail}`)
        .limit(1);
      const existingByEmail = (emailMatches ?? [])[0];
      if (existingByEmail) {
        return NextResponse.json(
          { error: `A student with this email is already registered as "${existingByEmail.full_name}" at ${existingByEmail.school_name || 'Rillcod'}.` },
          { status: 400 }
        );
      }
    }

    // 2. Resolve target school and enforce teacher guard
    let targetSchoolId = body.school_id;
    
    if (caller.role === 'teacher') {
      // Teachers MUST specify a school or use their own, and it must be one they are assigned to
      const { data: assignments } = await supabase
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id);
      
      const allowedIds = assignments?.map(a => a.school_id).filter(Boolean) || [];
      if (caller.school_id) allowedIds.push(caller.school_id);

      if (targetSchoolId && !allowedIds.includes(targetSchoolId)) {
        return NextResponse.json({ error: 'You are not assigned to this school' }, { status: 403 });
      }
      
      // If no school_id provided but teacher only has one school, auto-assign it
      if (!targetSchoolId) {
        if (allowedIds.length === 1) targetSchoolId = allowedIds[0];
        else if (allowedIds.length > 1) {
          return NextResponse.json({ error: 'Please select which school you are registering this student for' }, { status: 400 });
        } else {
          return NextResponse.json({ error: 'You are not assigned to any school. Please contact support.' }, { status: 403 });
        }
      }
    } else if (caller.role === 'school') {
      // School roles are locked to their own school
      targetSchoolId = caller.school_id;
    }

    let targetSchoolName: string | null = null;
    if (!targetSchoolId && body.enrollment_type === 'online') {
      try {
        const onlineSchool = await resolveOnlineSchool(supabase as any);
        targetSchoolId = onlineSchool.id;
        targetSchoolName = onlineSchool.name;
      } catch (schoolError) {
        console.error('Online school resolution error:', schoolError);
        return NextResponse.json({ error: 'Online School could not be prepared. Please try again.' }, { status: 500 });
      }
    }
    if (!targetSchoolId) {
      return NextResponse.json({ error: 'Select a registered school before saving this student.' }, { status: 400 });
    }
    const { data: targetSchool, error: schoolLookupError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', targetSchoolId)
      .eq('status', 'approved')
      .maybeSingle();
    if (schoolLookupError || !targetSchool) {
      return NextResponse.json({ error: 'The selected school is not registered or approved.' }, { status: 400 });
    }
    targetSchoolId = targetSchool.id;
    targetSchoolName = targetSchool.name;

    // 3. Duplicate Name check — a child shouldn't be registered twice. Look up the name
    //    EVERYWHERE (not just the target school): a single entry that lands at a different
    //    school (e.g. fell back to the Online School) was creating a cross-school twin
    //    (the "stray"). Soft block (requiresVerification) so staff can force it through for
    //    a genuinely different child who happens to share the name.
    if (fullName && !isForce) {
      // Strong barricade — the SAME normalized key (word-order-, case-, and noise-insensitive)
      // catches "Ada Ngozi" ≡ "Ngozi Ada" ≡ "Ada Ngozi 2", matching bulk-register. We scan the
      // target school first (strict), then fall back to a global exact-ish name net.
      const incomingKey = duplicateNameKey(fullName);
      const dupSelect = 'id, full_name, grade_level, school_id, school_name';

      // 1) Same-school scan by normalized key (fetch the school's students once).
      let sameSchoolHit: any = null;
      if (targetSchoolId && incomingKey) {
        const { data: schoolStudents } = await supabase
          .from('students')
          .select(dupSelect)
          .eq('school_id', targetSchoolId)
          .neq('is_deleted', true);
        sameSchoolHit = (schoolStudents ?? []).find(m => duplicateNameKey(m.full_name) === incomingKey) ?? null;
      }

      // 2) Global exact/reversed name net (catches cross-school twins / the "stray").
      const { data: nameMatches } = await supabase
        .from('students')
        .select(dupSelect)
        .ilike('full_name', fullName)
        .neq('is_deleted', true);
      const globalHit = sameSchoolHit
        ?? (targetSchoolId ? (nameMatches ?? []).find(m => m.school_id === targetSchoolId) : null)
        ?? (nameMatches ?? []).find(m => incomingKey && duplicateNameKey(m.full_name) === incomingKey)
        ?? (nameMatches ?? [])[0];

      const hit = sameSchoolHit ?? globalHit;
      const sameSchool = !!sameSchoolHit || (targetSchoolId && hit?.school_id === targetSchoolId);
      if (hit) {
        return NextResponse.json(
          {
            error: 'Duplicate Name Detected',
            message: sameSchool
              ? `A student named "${hit.full_name}" is already registered in this school (${hit.grade_level || 'No Grade'}). If this is genuinely a different child, confirm to proceed.`
              : `A student named "${hit.full_name}" already exists at ${hit.school_name || 'another school'}. If this is a different child, confirm to proceed.`,
            requiresVerification: true,
          },
          { status: 409 } // Conflict
        );
      }
    }

    // Modern grade/section convention: grade_level = the SPECIFIC canonical grade
    // (Basic 2, JSS 1 …), section = the cohort/class label (Alpha, Gold …). They are
    // distinct — grade is never folded into the section, and vice-versa.
    const specificGrade = cleanGrade(body.grade_level || body.current_class) || null;
    const sectionLabel = (body.section_class || body.section || '').trim() || null;

    // Map the incoming frontend fields cleanly to DB schema columns
    const newStudentData: any = {
      name: fullName,
      full_name: fullName,
      date_of_birth: body.date_of_birth,
      gender: body.gender,
      parent_name: body.parent_name,
      parent_email: body.parent_email || (body.parentEmail ? body.parentEmail : (primaryEmail && body.student_email ? null : primaryEmail)),
      student_email: body.student_email || (body.studentEmail ? body.studentEmail : (primaryEmail && !body.parent_email ? primaryEmail : null)),
      parent_phone: body.parent_phone || body.parentPhone,
      school_id: targetSchoolId,
      school_name: targetSchoolName,
      current_class: sectionLabel,
      section: sectionLabel,
      grade_level: specificGrade,
      grade: specificGrade,
      city: body.city,
      state: body.state,
      interests: body.interests,
      goals: body.goals,
      course_interest: body.course_interest || body.interests || null,
      preferred_schedule: body.preferred_schedule || body.goals || null,
      status: 'pending',
      created_by: caller.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    newStudentData.enrollment_type = body.enrollment_type || (caller.role === 'school' || caller.role === 'teacher' ? 'school' : 'in_person');
    if (body.heard_about_us) newStudentData.heard_about_us = body.heard_about_us;
    if (body.parent_relationship) newStudentData.parent_relationship = body.parent_relationship;

    // Create new student registration
    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert([newStudentData])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating student:', insertError);
      return NextResponse.json({ error: 'Failed to create student registration' }, { status: 500 });
    }

    // "Instant Student Access" (lms_auto_portals): when ON, the just-registered student is
    // auto-activated into a portal account by the client; when OFF, they stay a pending
    // application for staff to activate later. Explicit class placement always activates.
    const autoActivate = await isAutoPortalsOn(supabase);

    return NextResponse.json(
      { message: 'Student registration successful', student: newStudent, auto_activate: autoActivate },
      { status: 201 }
    );

  } catch (error) {
    console.error('Unexpected error in student registration:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = adminClient();
  try {
    const { searchParams } = new URL(request.url);
    const parentEmail = searchParams.get('parentEmail');
    const limitParam = Number(searchParams.get('limit') ?? 0);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : null;

    // ── Public single-student lookup by parentEmail (registration form) ──
    if (parentEmail) {
      const { data: student, error } = await supabase
        .from('students')
        .select('id, full_name, status, enrollment_type, created_at, school_name')
        .eq('parent_email', parentEmail)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({ error: 'No student registration found with this email' }, { status: 404 });
        }
        console.error('Error fetching student:', error);
        return NextResponse.json({ error: 'Failed to fetch student registration' }, { status: 500 });
      }
      return NextResponse.json({ student });
    }

    // ── Staff dashboard listing — requires auth ──
    const serverClient = await createServerClient();
    const { data: { user }, error: authErr } = await serverClient.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id, school_name, id')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    let query = supabase
      .from('students')
      .select(`
        id, full_name, school_name, school_id, user_id,
        student_email, enrollment_type,
        parent_name, parent_email, parent_phone, parent_relationship,
        grade_level, gender, date_of_birth, city, state,
        interests, goals, heard_about_us,
        course_interest, preferred_schedule,
        status, created_at, approved_at, approved_by
      `)
      .order('created_at', { ascending: false });

    if (caller.role === 'admin') {
      // Admin sees all — no filter
    } else if (caller.role === 'school') {
      // Filter by school_id, with school_name fallback for legacy registrations
      if (caller.school_id) {
        const schoolNames: string[] = [];
        if (caller.school_name) schoolNames.push(caller.school_name);
        const { data: schoolRow } = await supabase.from('schools').select('name').eq('id', caller.school_id).maybeSingle();
        if (schoolRow?.name && !schoolNames.includes(schoolRow.name)) schoolNames.push(schoolRow.name);
        const parts: string[] = [`school_id.eq.${caller.school_id}`];
        schoolNames.forEach(n => parts.push(`school_name.eq.${JSON.stringify(n)}`));
        query = query.or(parts.join(',')) as any;
      } else if (caller.school_name) {
        query = query.eq('school_name', caller.school_name) as any;
      } else {
        return NextResponse.json({ data: [] });
      }
    } else if (caller.role === 'teacher') {
      // Shared isolation boundary: owned classes plus unowned classes in assigned schools.
      const isolated = await isTeacherIsolationOn(supabase as any);
      const classScope = await getTeacherClassScope(supabase as any, caller.id, caller.school_id, !isolated);
      const assignedIds = classScope.assignedSchoolIds;
      const myClassIds = classScope.classIds;
      const myClassNames = classScope.classNames;

      const userIdSet = new Set<string>();

      // Primary: portal students directly assigned via class_id
      if (myClassIds.length > 0) {
        const { data: direct } = await supabase
          .from('portal_users')
          .select('id')
          .in('class_id', myClassIds)
          .eq('role', 'student');
        (direct ?? []).forEach((s: any) => userIdSet.add(s.id));
      }

      // Fallback: class_id was cleared (e.g. DB repair) but section_class text still matches
      if (myClassNames.length > 0 && assignedIds.length > 0) {
        const { data: fallback } = await supabase
          .from('portal_users')
          .select('id')
          .in('section_class', myClassNames)
          .in('school_id', assignedIds)
          .is('class_id', null)
          .eq('role', 'student');
        (fallback ?? []).forEach((s: any) => userIdSet.add(s.id));
      }

      const studentUserIds = Array.from(userIdSet);

      // Also catch students whose current_class matches teacher's class names at their school.
      // Covers admin/school-registered students before portal_users.section_class is synced.
      // Use a separate pre-query to avoid PostgREST string escaping issues with class names.
      let currentClassStudentIds: string[] = [];
      if (myClassNames.length > 0 && assignedIds.length > 0) {
        const { data: ccRows } = await supabase
          .from('students')
          .select('id')
          .in('current_class', myClassNames)
          .in('school_id', assignedIds);
        currentClassStudentIds = (ccRows ?? []).map((s: any) => s.id);
      }

      // Build OR: teacher registered | in teacher's classes | current_class at teacher's school
      // If teacher has no personal classes, fall back to school-level so they see all their students.
      const orParts: string[] = [`created_by.eq.${caller.id}`];
      if (studentUserIds.length > 0) orParts.push(`user_id.in.(${studentUserIds.join(',')})`);
      if (currentClassStudentIds.length > 0) orParts.push(`id.in.(${currentClassStudentIds.join(',')})`)
      if (myClassIds.length === 0 && assignedIds.length > 0) {
        // No teacher-id classes found — include all students registered at teacher's schools
        orParts.push(`school_id.in.(${assignedIds.join(',')})`);
      }
      query = query.or(orParts.join(',')) as any;
    }

    if (limit) query = query.limit(limit) as any;

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });

  } catch (error) {
    console.error('Unexpected error in student lookup:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
} 
