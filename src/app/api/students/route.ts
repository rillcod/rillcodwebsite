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

    // Create new student registration
    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert([{
        ...body,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
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