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
  try {
    const body = await request.json();
    const parentEmail = body.parent_email || body.parentEmail;

    // Check if student already exists
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('id, status')
      .eq('parent_email', parentEmail)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error checking existing student:', checkError);
      return NextResponse.json(
        { error: 'Failed to check student registration' },
        { status: 500 }
      );
    }

    if (existingStudent) {
      return NextResponse.json(
        { error: 'A student with this email is already registered' },
        { status: 400 }
      );
    }

    // Map the incoming frontend fields cleanly to DB schema columns
    const fullName = body.full_name || body.fullName;
    const newStudentData: any = {
      name: fullName,
      full_name: fullName,
      date_of_birth: body.date_of_birth,
      gender: body.gender,
      parent_name: body.parent_name,
      parent_email: parentEmail,
      parent_phone: body.parent_phone,
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optional fields that may not exist in older DB schemas — add only if provided
    if (body.enrollment_type) newStudentData.enrollment_type = body.enrollment_type;
    if (body.student_email) newStudentData.student_email = body.student_email;
    if (body.heard_about_us) newStudentData.heard_about_us = body.heard_about_us;
    if (body.parent_relationship) newStudentData.parent_relationship = body.parent_relationship;
    if (body.school_id) newStudentData.school_id = body.school_id;

    // Resolve school_id if not already set — every student must belong to a school
    if (!newStudentData.school_id) {
      if (body.enrollment_type === 'school' && body.school_name) {
        // Partner school student: find by exact name match first, then fuzzy
        const { data: exactMatch } = await supabase
          .from('schools')
          .select('id, name')
          .ilike('name', body.school_name.trim())
          .eq('status', 'approved')
          .maybeSingle();
        if (exactMatch?.id) {
          newStudentData.school_id = exactMatch.id;
          newStudentData.school_name = exactMatch.name; // normalise casing
        }
      } else {
        // Online / bootcamp / unknown: assign to the "Online" fallback school
        const { data: onlineSchool } = await supabase
          .from('schools')
          .select('id, name')
          .ilike('name', '%online%')
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle();
        if (onlineSchool?.id) {
          newStudentData.school_id = onlineSchool.id;
          newStudentData.school_name = onlineSchool.name;
        }
      }
    }

    // Create new student registration
    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert([newStudentData])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating student:', insertError);
      return NextResponse.json(
        { error: 'Failed to create student registration' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: 'Student registration successful',
        student: newStudent
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Unexpected error in student registration:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
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
      // Filter by school profile id or school_id
      const ids: string[] = [];
      if (caller.id) ids.push(caller.id);
      if (caller.school_id) ids.push(caller.school_id);
      if (ids.length > 0) {
        query = query.in('school_id', ids) as any;
      }
    } else if (caller.role === 'teacher') {
      // Collect all school IDs from teacher_schools + teacher's own school_id
      const schoolIds: string[] = [];
      if (caller.school_id) schoolIds.push(caller.school_id);

      const { data: ts } = await supabase
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', caller.id);
      (ts ?? []).forEach((r: any) => {
        if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id);
      });

      if (schoolIds.length > 0) {
        // Filter by school_id UUID OR school_name text match
        const schoolNames: string[] = [];
        if (caller.school_name) schoolNames.push(caller.school_name);
        const { data: schoolRows } = await supabase
          .from('schools')
          .select('id, name')
          .in('id', schoolIds);
        (schoolRows ?? []).forEach((s: any) => { if (s.name) schoolNames.push(s.name); });

        // Build OR filter: school_id in list OR school_name in list
        const parts: string[] = [`school_id.in.(${schoolIds.join(',')})`];
        if (schoolNames.length > 0) {
          schoolNames.forEach(n => parts.push(`school_name.eq."${n}"`));
        }
        query = query.or(parts.join(',')) as any;
      } else {
        // Teacher has no school affiliation — return empty
        return NextResponse.json({ data: [] });
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });

  } catch (error) {
    console.error('Unexpected error in student lookup:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
} 