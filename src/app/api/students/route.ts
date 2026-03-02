import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(request: Request) {
  const supabase = createClient();
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
    const newStudentData: Record<string, any> = {
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

    // For partner school students: try to link to the schools table record
    if (body.enrollment_type === 'school' && body.school_name) {
      const { data: schoolMatch } = await supabase
        .from('schools')
        .select('id')
        .ilike('name', body.school_name.trim())
        .maybeSingle();
      if (schoolMatch?.id) newStudentData.school_id = schoolMatch.id;
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
  const supabase = createClient();
  try {
    const { searchParams } = new URL(request.url);
    const parentEmail = searchParams.get('parentEmail');

    if (!parentEmail) {
      return NextResponse.json(
        { error: 'Parent email parameter is required' },
        { status: 400 }
      );
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('parent_email', parentEmail)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return NextResponse.json(
          { error: 'No student registration found with this email' },
          { status: 404 }
        );
      }
      console.error('Error fetching student:', error);
      return NextResponse.json(
        { error: 'Failed to fetch student registration' },
        { status: 500 }
      );
    }

    return NextResponse.json({ student });

  } catch (error) {
    console.error('Unexpected error in student lookup:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
} 