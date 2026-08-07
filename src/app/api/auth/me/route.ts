import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getSafeAutoProfileRole } from './role-utils';
import { canActivatePortalUser } from '@/lib/portal/structure';
import { logActivity, shouldRecordSession } from '@/lib/activity/log';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const LAST_LOGIN_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Record that this account is in use. Never throws and never blocks the profile response —
 * a failed activity stamp must not stop someone signing in.
 */
async function stampLastLogin(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  currentLastLogin: string | null,
) {
  try {
    if (currentLastLogin) {
      const age = Date.now() - new Date(currentLastLogin).getTime();
      if (Number.isFinite(age) && age < LAST_LOGIN_THROTTLE_MS) return;
    }
    await admin.from('portal_users').update({ last_login: new Date().toISOString() }).eq('id', userId);
  } catch (err) {
    console.error('[auth/me] last_login stamp failed', err);
  }
}

// GET /api/auth/me — returns the portal_users profile for the current session.
// Uses service role to bypass RLS so this always works regardless of policies.
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const profileSelect =
      'id, email, full_name, role, is_active, phone, bio, profile_image_url, class_id, school_id, school_name, section_class, grade, current_module, date_of_birth, enrollment_type, last_login, created_at, updated_at';
    const { data, error } = await admin
      .from('portal_users')
      .select(profileSelect)
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      // Missing portal row — create a PENDING (inactive) shell only.
      // Never invent an active account without school/class structure.
      const meta = user.user_metadata ?? {};
      const safeRole = getSafeAutoProfileRole(meta.role);
      const schoolId = typeof meta.school_id === 'string' ? meta.school_id : null;
      const classId = typeof meta.class_id === 'string' ? meta.class_id : null;
      const active = canActivatePortalUser(safeRole, { schoolId, classId });

      const { error: upsertErr } = await admin.from('portal_users').upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: meta.full_name ?? user.email?.split('@')[0] ?? '',
        role: safeRole,
        school_id: schoolId,
        class_id: classId,
        is_active: active,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (upsertErr) {
        return NextResponse.json({ error: 'Profile not found and could not be created' }, { status: 500 });
      }

      const { data: created, error: fetchErr } = await admin
        .from('portal_users')
        .select(profileSelect)
        .eq('id', user.id)
        .maybeSingle();

      if (fetchErr || !created) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      return NextResponse.json({
        profile: {
          ...created,
          grade_level: (created as { grade?: string | null }).grade ?? null,
          class_name: created.section_class ?? null,
        },
      });
    }

    // Stamp last_login here rather than relying on POST /api/auth/me — nothing in the app
    // ever called that, so the column stayed null for ~99% of accounts while dormant-account
    // tooling (lib/admin/platform-sanitation) filters on `last_login is null` and therefore
    // treated every user as never having signed in. This GET runs on every session load, so
    // throttle it to one write per hour per user instead of writing on every page view.
    void stampLastLogin(admin, user.id, data.last_login ?? null);

    // Activity belongs in activity_logs, not the CRM. This runs on every session
    // load and is throttled on the same rule as the last_login stamp, so it
    // measures attendance rather than clicking.
    if (shouldRecordSession(data.last_login ?? null)) {
      void logActivity(admin as never, {
        userId: user.id,
        event: 'session_started',
        schoolId: (data as { school_id?: string | null }).school_id ?? null,
        metadata: { role: data.role ?? null },
        userAgent: request.headers.get('user-agent'),
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
