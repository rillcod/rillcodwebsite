import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';


function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/schools — public email status lookup OR admin list
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  // Public: email status check — returns only name, status, created_at (no sensitive data)
  if (email) {
    const { data, error } = await adminClient()
      .from('schools')
      .select('name, status, created_at')
      .eq('email', email)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ school: data });
  }

  // Staff: full list (admin/school) or assigned-only list (teacher)
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: caller } = await supabase.from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'school', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const admin = adminClient();

  // School partner: return only their own school
  if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    const { data, error } = await admin
      .from('schools')
      .select('id, name, status')
      .eq('id', caller.school_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  // Teacher: return only their assigned schools (from teacher_schools + profile.school_id)
  if (caller.role === 'teacher') {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', caller.id);
    const ids: string[] = (ts ?? []).map((r: any) => r.school_id).filter(Boolean);
    if (caller.school_id && !ids.includes(caller.school_id)) ids.push(caller.school_id);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    const { data, error } = await admin
      .from('schools')
      .select('id, name, status')
      .in('id', ids)
      .order('name');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  const { data, error } = await admin
    .from('schools')
    .select('*, portal_users(id, email, full_name), teacher_schools(id, teacher_id, portal_users:teacher_id(id, full_name, email))')
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = adminClient(); // service role — bypasses RLS
  try {
    const body = await request.json();

    // Determine if this is an authenticated admin request or a public application
    let callerRole: string | null = null;
    try {
      const supabaseAuth = await createServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user) {
        const { data: caller } = await supabaseAuth.from('portal_users').select('role').eq('id', user.id).single();
        callerRole = caller?.role ?? null;
      }
    } catch { /* public request — no session */ }

    const isAdminRequest = callerRole === 'admin' || callerRole === 'school';

    // Public applications are always 'pending'; admin can set any status
    const status = isAdminRequest ? (body.status || 'pending') : 'pending';

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
      enrollment_types: body.enrollment_types || ['school'],
      status,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('schools')
      .insert([payload])
      .select('*, portal_users(id, email, full_name), teacher_schools(id, teacher_id, portal_users:teacher_id(id, full_name, email))')
      .single();

    if (error) {
      console.error('Error creating school:', error);
      return NextResponse.json({ error: error.message || 'Failed to create school registration' }, { status: 500 });
    }

    return NextResponse.json({ message: 'School registration successful', school: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in school registration:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

