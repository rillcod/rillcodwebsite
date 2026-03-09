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

  // Admin-only: full list
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: caller } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!caller || !['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { data, error } = await adminClient()
    .from('schools')
    .select('*, portal_users(id, email, full_name)')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = adminClient(); // service role — bypasses RLS for school creation
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

