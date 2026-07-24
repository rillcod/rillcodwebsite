import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
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
  const archived = searchParams.get('archived') === 'true';

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

  // Admins can view the archived (soft-deleted) list via ?archived=true so a school can
  // be restored; the default list continues to exclude archived schools.
  let listQuery = admin
    .from('schools')
    .select('*, portal_users!portal_users_school_id_fkey(id, email, full_name), teacher_schools(id, teacher_id, portal_users!teacher_schools_teacher_id_fkey(id, full_name, email))')
    .order('created_at', { ascending: false });
  listQuery = archived
    ? listQuery.eq('is_deleted', true)
    : listQuery.or('is_deleted.eq.false,is_deleted.is.null');

  const { data, error } = await listQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = adminClient();
  try {
    const ip = getClientIp(request as any);
    try {
      await checkCustomRateLimit({ key: `school-reg:${ip}`, max: 5, window: 3600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: 'Too many applications. Please try again later.' }, { status: 429 });
      }
      throw err;
    }

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

    if (!isAdminRequest && payload.email) {
      const normalizedEmail = String(payload.email).trim().toLowerCase();
      const { data: existingPending } = await supabase
        .from('schools')
        .select('id, status')
        .eq('email', normalizedEmail)
        .in('status', ['pending', 'approved'])
        .limit(1)
        .maybeSingle();
      if (existingPending) {
        return NextResponse.json(
          { error: 'An application for this email is already on file. Check your inbox or contact support.' },
          { status: 409 },
        );
      }
    }

    const { data, error } = await supabase
      .from('schools')
      .insert([payload])
      .select('*, portal_users!portal_users_school_id_fkey(id, email, full_name), teacher_schools(id, teacher_id, portal_users!teacher_schools_teacher_id_fkey(id, full_name, email))')
      .single();

    if (error) {
      console.error('Error creating school:', error);
      return NextResponse.json({ error: error.message || 'Failed to create school registration' }, { status: 500 });
    }

    try {
      const { captureSchoolPartnershipLead } = await import('@/lib/crm/intake-capture');
      await captureSchoolPartnershipLead(supabase as any, {
        schoolName: payload.name,
        contactName: payload.contact_person,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        programInterest: Array.isArray(payload.program_interest) ? payload.program_interest.join(', ') : null,
        studentCount: payload.student_count,
      });
    } catch (crmErr) {
      console.error('[schools] intake capture failed (non-fatal):', crmErr);
    }

    return NextResponse.json({ message: 'School registration successful', school: data }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in school registration:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

