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
  // Use adminClient to bypass RLS on portal_users
  const { data: caller } = await adminClient()
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
// If `password` is supplied it is used; otherwise a random one is generated.
export async function POST(request: Request) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id, action, password: suppliedPassword } = await request.json();
  if (!id || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch only the fields we need — avoid select('*') for security hygiene
  const { data: school, error: fetchErr } = await admin
    .from('schools')
    .select('id, name, email, contact_person, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  // Update status on the school row (applies to both approve and reject)
  await admin.from('schools').update({
    status: action,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (action === 'rejected') {
    return NextResponse.json({ success: true });
  }

  // ── Approval path ────────────────────────────────────────────────────────
  if (!school.email) {
    return NextResponse.json({
      success: true,
      warning: 'School approved but no email on record — portal account not created',
    });
  }

  // Consistent 8-char minimum across the platform
  const password = (suppliedPassword && suppliedPassword.length >= 8)
    ? suppliedPassword
    : crypto.randomBytes(8).toString('base64url').slice(0, 10);

  const normalizedEmail = school.email.trim().toLowerCase();

  // ── Step 1: Check portal_users by email FIRST ────────────────────────────
  // portal_users has UNIQUE(email). If a row already exists for this email
  // (e.g. created via user admin, or from a previous attempt) we must UPDATE
  // it rather than INSERT — otherwise we hit the unique constraint and the
  // portal row is never linked to the school.
  const { data: existingPortal } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingPortal) {
    // Row exists — update it to link with this school
    const { error: updateErr } = await admin.from('portal_users').update({
      role: 'school',
      school_id: school.id,
      school_name: school.name,
      full_name: school.contact_person || school.name,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existingPortal.id);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to link portal account: ${updateErr.message}` }, { status: 500 });
    }

    // Only update password if supplied and meets minimum length
    if (suppliedPassword && suppliedPassword.length >= 8) {
      await admin.auth.admin.updateUserById(existingPortal.id, {
        password: suppliedPassword,
        user_metadata: { full_name: school.contact_person || school.name, role: 'school' },
      });
      return NextResponse.json({
        success: true,
        credentials: { email: school.email, password: suppliedPassword },
      });
    }

    return NextResponse.json({ success: true, credentials: null });
  }

  // ── Step 2: No existing portal row — create auth user + portal row ───────
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
  let usedExistingAuth = false;

  if (authErr) {
    // Auth user exists in auth.users but somehow not in portal_users — look it up
    if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
      return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 500 });
    }
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find(
      u => u.email?.trim().toLowerCase() === normalizedEmail
    );
    if (existing) {
      authUserId = existing.id;
      usedExistingAuth = true;
      // Also update their password and metadata to match the latest school data
      await admin.auth.admin.updateUserById(authUserId, {
        password,
        user_metadata: {
          full_name: school.contact_person || school.name,
          role: 'school',
        },
      });
    }
  } else {
    authUserId = authData?.user?.id ?? null;
  }

  if (!authUserId) {
    return NextResponse.json({ error: 'Could not resolve auth user ID' }, { status: 500 });
  }

  // Use upsert to create/fix the portal_users row — ensures it's linked to the correct school
  const { error: portalErr } = await admin.from('portal_users').upsert({
    id: authUserId,
    email: normalizedEmail,
    full_name: school.contact_person || school.name,
    role: 'school',
    school_name: school.name,
    school_id: school.id,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (portalErr) {
    return NextResponse.json({ error: `Portal account synchronization failed: ${portalErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    credentials: !usedExistingAuth ? { email: school.email, password } : null,
  });
}
