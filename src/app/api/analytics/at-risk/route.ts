import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile to check role and school
    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, role, school_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Only admin, teacher, and school roles can view at-risk students
    if (!['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const requestedSchoolId = searchParams.get('school_id') || profile.school_id;
    const classId = searchParams.get('class_id');
    const threshold = parseInt(searchParams.get('threshold') || '50', 10);

    if (!requestedSchoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 400 });
    }

    // Teachers must be assigned to the requested school
    let schoolId = requestedSchoolId;
    if (profile.role === 'teacher') {
      const db = createAdminClient();
      const { data: tsRows } = await db
        .from('teacher_schools')
        .select('school_id')
        .eq('teacher_id', profile.id);
      const assignedIds = new Set<string>();
      if (profile.school_id) assignedIds.add(profile.school_id);
      for (const r of tsRows ?? []) {
        if ((r as any).school_id) assignedIds.add((r as any).school_id);
      }
      if (!assignedIds.has(requestedSchoolId)) {
        return NextResponse.json({ error: 'Access denied: school is outside your scope' }, { status: 403 });
      }
    }

    // Use the optimized RPC function
    const { data, error } = await supabase.rpc(
      'get_at_risk_students',
      {
        p_school_id: schoolId,
        p_class_id: classId || null,
      }
    );

    if (error) {
      console.error('Error fetching at-risk students:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by class if specified
    let students = data || [];
    if (classId) {
      students = students.filter((s: any) => s.class_id === classId);
    }

    return NextResponse.json({
      success: true,
      data: students,
      count: students.length,
    });
  } catch (error: any) {
    console.error('Error in at-risk API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
