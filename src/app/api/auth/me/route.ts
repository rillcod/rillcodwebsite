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

    const admin = adminClient();
    const profileSelect =
      'id, email, full_name, role, is_active, phone, bio, profile_image_url, class_id, school_id, school_name, section_class, grade, current_module, date_of_birth, enrollment_type, created_at, updated_at';
    const { data, error } = await admin
      .from('portal_users')
      .select(profileSelect)
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      // portal_users row missing for a valid auth user — auto-create it (self-heal).
      // This covers: trigger didn't fire, manual auth creation, migration gap, etc.
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
        .select(profileSelect)
        .eq('id', user.id)
        .maybeSingle();

      if (fetchErr || !created) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      // grade_level = specific grade (Basic 2 / JSS 1); section_class = registered class/cohort.
      // Never alias section_class as grade — that made login dashboards show class bands as grades.
      return NextResponse.json({
        profile: {
          ...created,
          grade_level: (created as { grade?: string | null }).grade ?? null,
          class_name: created.section_class ?? null,
        },
      });
    }

    return NextResponse.json({
      profile: {
        ...data,
        grade_level: (data as { grade?: string | null }).grade ?? null,
        class_name: data.section_class ?? null,
      },
    });
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
