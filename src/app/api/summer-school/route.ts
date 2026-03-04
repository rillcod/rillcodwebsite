import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      student_name,
      parent_name,
      parent_phone,
      parent_email,
      school,
      current_class,
      age,
      gender,
      preferred_mode,
      additional_info,
    } = body;

    if (!student_name || !parent_name || !parent_phone) {
      return NextResponse.json(
        { error: 'Student name, parent name, and phone are required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get first school as default for direct registrations
    const { data: schoolRows } = await (supabase as any)
      .from('schools')
      .select('id')
      .limit(1);
    const schoolId = Array.isArray(schoolRows) && schoolRows[0]?.id ? schoolRows[0].id : null;

    const { data, error } = await (supabase as any)
      .from('prospective_students')
      .insert({
        full_name: student_name,
        email: parent_email || `summer-${Date.now()}@rillcod.com`,
        parent_name,
        parent_phone,
        parent_email: parent_email || null,
        grade: current_class || null,
        school_id: schoolId,
        school_name: school || 'Direct / Summer School',
        age: age || null,
        gender: gender || null,
        course_interest: 'JSS3 Summer School 2026',
        preferred_schedule: preferred_mode || null,
        hear_about_us: additional_info || 'Summer School Registration Form',
        is_active: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Summer school registration error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to save registration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data?.id,
      message: 'Registration submitted successfully. We will contact you shortly.',
    });
  } catch (err: any) {
    console.error('Summer school API error:', err);
    return NextResponse.json(
      { error: err.message || 'Something went wrong' },
      { status: 500 }
    );
  }
}
