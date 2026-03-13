import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: caller } = await supabase
      .from('portal_users')
      .select('role, school_id')
      .eq('id', user.id)
      .single();

    if (!caller || (caller.role !== 'admin' && caller.role !== 'teacher')) {
      return NextResponse.json({ error: 'Only admins and teachers can bulk-enroll students' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userIds,       // string[]  — students to enroll
      program_id,    // string    — target program
      school_id,     // string?   — optionally (re-)set school on student profiles
      section_class, // string?   — optionally (re-)set class on student profiles
    } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'No student IDs provided' }, { status: 400 });
    }
    if (!program_id) {
      return NextResponse.json({ error: 'program_id is required' }, { status: 400 });
    }

    // Verify all IDs are student accounts
    const { data: verified } = await supabaseAdmin
      .from('portal_users')
      .select('id')
      .in('id', userIds)
      .eq('role', 'student');

    const safeIds = (verified ?? []).map((u) => u.id);
    if (safeIds.length === 0) {
      return NextResponse.json({ error: 'No valid student accounts found for the given IDs' }, { status: 400 });
    }

    // Optionally update school and/or class on the student profiles
    if (school_id || section_class) {
      const profileUpdate: Record<string, string> = {};
      if (school_id)     profileUpdate.school_id     = school_id;
      if (section_class) profileUpdate.section_class = section_class;

      const { error: profileErr } = await supabaseAdmin
        .from('portal_users')
        .update({ ...profileUpdate, updated_at: new Date().toISOString() })
        .in('id', safeIds);

      if (profileErr) {
        return NextResponse.json({ error: `Profile update failed: ${profileErr.message}` }, { status: 500 });
      }
    }

    // Upsert enrollment records
    const enrollments = safeIds.map((userId) => ({
      user_id:    userId,
      program_id,
      role:       'student',
      status:     'active',
    }));

    const { error: enrollErr } = await supabaseAdmin
      .from('enrollments')
      .upsert(enrollments, { onConflict: 'user_id,program_id,role' });

    if (enrollErr) {
      return NextResponse.json({ error: `Enrollment failed: ${enrollErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      enrolled: safeIds.length,
      skipped:  userIds.length - safeIds.length,
      program_id,
      section_class: section_class ?? null,
      school_id:     school_id ?? null,
    });

  } catch (err: any) {
    console.error('Bulk enroll error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
