import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export async function POST(request: Request) {
  const supabase = createClient();
  try {
    const body = await request.json();

    const payload = {
      name: body.name || body.schoolName,
      school_type: body.school_type || body.schoolType || null,
      contact_person: body.contact_person || body.principalName || null,
      address: body.address || body.schoolAddress || null,
      lga: body.lga || null,
      city: body.city || null,
      state: body.state || null,
      phone: body.phone || body.schoolPhone || null,
      email: body.email || body.schoolEmail || null,
      student_count: body.student_count ?? (body.studentCount ? parseInt(body.studentCount, 10) : null),
      program_interest: body.program_interest || (body.programInterest ? [body.programInterest] : []),
      status: body.status || 'pending',
      enrollment_types: body.enrollment_types || ['school'],
      is_active: true,
    };

    const { data, error } = await supabase
      .from('schools')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error creating school:', error);
      return NextResponse.json({ error: 'Failed to create school registration' }, { status: 500 });
    }

    return NextResponse.json({ message: 'School registration successful', school: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in school registration:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const supabase = createClient();
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('schools')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'No school registration found with this email' }, { status: 404 });
      }
      console.error('Error fetching school:', error);
      return NextResponse.json({ error: 'Failed to fetch school registration' }, { status: 500 });
    }

    return NextResponse.json({ school: data });
  } catch (error) {
    console.error('Unexpected error in school lookup:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
