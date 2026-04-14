import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getSafeAutoProfileRole } from './role-utils';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/auth/me — returns the portal_users profile for the current session.
// Uses service role to bypass RLS so this always works regardless of policies.
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await adminClient()
      .from('portal_users')
      .select('id, email, full_name, role, is_active, phone, bio, profile_image_url, school_id, school_name, section_class, current_module, date_of_birth, enrollment_type, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      // portal_users row missing for a valid auth user — auto-create it (self-heal).
      // This covers: trigger didn't fire, manual auth creation, migration gap, etc.
      const admin = adminClient();
      const meta = user.user_metadata ?? {};
      const safeRole = getSafeAutoProfileRole(meta.role);
      const { error: upsertErr } = await admin.from('portal_users').upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: meta.full_name ?? user.email?.split('@')[0] ?? '',
        role: safeRole,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (upsertErr) {
        return NextResponse.json({ error: 'Profile not found and could not be created' }, { status: 500 });
      }

      // Re-fetch the newly created row
      const { data: created, error: fetchErr } = await admin
        .from('portal_users')
        .select('id, email, full_name, role, is_active, phone, bio, profile_image_url, school_id, school_name, section_class, current_module, date_of_birth, enrollment_type, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchErr || !created) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      return NextResponse.json({ profile: created });
    }

    return NextResponse.json({ profile: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/auth/me — stamps last_login for the current authenticated user.
// Self-only, uses service role to bypass RLS.
export async function POST() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await adminClient()
      .from('portal_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}
