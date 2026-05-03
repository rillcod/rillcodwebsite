import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
    const fullName = (body.full_name || body.fullName || '').trim();
    const isForce = body.force === true;

    // 1. Check for duplicate email (Global check)
    const { data: existingByEmail } = await supabase
      .from('students')
      .select('id, full_name, school_name')
      .or(`student_email.eq.${primaryEmail},parent_email.eq.${primaryEmail}`)
      .maybeSingle();

    if (existingByEmail) {
      return NextResponse.json(
        { error: `A student with this email is already registered as "${existingByEmail.full_name}" at ${existingByEmail.school_name || 'Rillcod'}.` },
        { status: 400 }
      );
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

    // 3. Check for duplicate Name in the same school (Duplicate Avoidance)
    if (fullName && targetSchoolId && !isForce) {
      const { data: existingByName } = await supabase
        .from('students')
        .select('id, full_name, grade_level')
        .eq('school_id', targetSchoolId)
        .ilike('full_name', fullName)
        .maybeSingle();

      if (existingByName) {
        return NextResponse.json(
          { 
            error: 'Duplicate Name Detected', 
            message: `A student named "${existingByName.full_name}" is already registered in this school (${existingByName.grade_level || 'No Grade'}).`,
            requiresVerification: true 
          },
          { status: 409 } // Conflict
        );
      }
    }

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
      school_name: body.school_name ?? null,
      current_class: body.grade_level || body.current_class,
      grade_level: body.grade_level || body.current_class,
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

    // Final school name normalization if we have a targetSchoolId
    if (targetSchoolId && !newStudentData.school_name) {
      const { data: sch } = await supabase.from('schools').select('name').eq('id', targetSchoolId).single();
      if (sch) newStudentData.school_name = sch.name;
    }

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

    return NextResponse.json(
      { message: 'Student registration successful', student: newStudent },
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
      // Step 1 — school: resolve teacher's assigned schools (outer boundary)
      const { data: schoolRows } = await supabase
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id);
      const assignedIds = (schoolRows ?? []).map((a: any) => a.school_id).filter(Boolean) as string[];
      if (caller.school_id && !assignedIds.includes(caller.school_id)) assignedIds.push(caller.school_id);

      // Step 2 — class: teacher's classes within those schools
      let classQ = supabase.from('classes').select('id, name').eq('teacher_id', caller.id);
      if (assignedIds.length > 0) classQ = classQ.in('school_id', assignedIds) as any;
      const { data: myClasses } = await classQ;
      const myClassIds = (myClasses ?? []).map((c: any) => c.id);
      const myClassNames = (myClasses ?? []).map((c: any) => c.name).filter(Boolean) as string[];

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
      const orParts: string[] = [`created_by.eq.${caller.id}`];
      if (studentUserIds.length > 0) orParts.push(`user_id.in.(${studentUserIds.join(',')})`);
      if (currentClassStudentIds.length > 0) orParts.push(`id.in.(${currentClassStudentIds.join(',')})`);
      query = query.or(orParts.join(',')) as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });

  } catch (error) {
    console.error('Unexpected error in student lookup:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
} 