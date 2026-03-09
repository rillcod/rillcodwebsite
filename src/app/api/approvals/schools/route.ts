import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await supabase
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// POST /api/approvals/schools
// Body: { id: string; action: 'approved' | 'rejected'; password?: string }
// On approval: creates auth account + portal_users row so the school can log in.
// If `password` is supplied by the caller it is used; otherwise a random one is generated.
export async function POST(request: Request) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id, action, password: suppliedPassword } = await request.json();
  if (!id || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch the school row
  const { data: school, error: fetchErr } = await admin
    .from('schools')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // Update status first (works for both approve and reject)
  await admin.from('schools').update({
    status: action,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (action === 'rejected') {
    return NextResponse.json({ success: true });
  }

  // ── Approval path ────────────────────────────────────────────
  if (!school.email) {
    return NextResponse.json({
      success: true,
      warning: 'School approved but no email on record — portal account not created',
    });
  }

  // Use the admin-supplied password or fall back to a random one
  const password = (suppliedPassword && suppliedPassword.length >= 6)
    ? suppliedPassword
    : crypto.randomBytes(8).toString('base64url').slice(0, 10);

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: school.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: school.contact_person || school.name,
      role: 'school',
    },
  });

  let authUserId: string | null = null;

  if (authErr) {
    if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
      return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 500 });
    }
    // Auth user already exists — find their ID so we can still create/update the portal row
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find(
      u => u.email?.trim().toLowerCase() === school.email.trim().toLowerCase()
    );
    if (existing) {
      authUserId = existing.id;
    }
    // No new password to return since we didn't create the auth account
  } else {
    authUserId = authData?.user?.id ?? null;
  }

  if (authUserId) {
    // Upsert portal_users row so the school can log in and be visible in user admin
    await admin.from('portal_users').upsert({
      id: authUserId,
      email: school.email,
      full_name: school.contact_person || school.name,
      role: 'school',
      school_name: school.name,
      school_id: school.id,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  return NextResponse.json({
    success: true,
    credentials: authUserId && !authErr ? { email: school.email, password } : null,
  });
}
