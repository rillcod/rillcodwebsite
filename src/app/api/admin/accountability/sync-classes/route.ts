import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseWrite } from '@/lib/supabase/require-result';

export const dynamic = 'force-dynamic';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server misconfiguration: SUPABASE keys not set');
  }
  return createClient<Database>(url, key);
}

/**
 * POST /api/admin/accountability/sync-classes
 * Auto-syncs portal_users.class_id to match the official active class_term_rosters
 * for all active students who currently have a class_mismatch flag.
 */
export async function POST() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!roleHasCapability(caller?.role, 'view_accountability')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 });
  }

  try {
    // 1. Fetch current active term
    const { data: term } = await db
      .from('academic_terms')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    // 2. Fetch active term rosters
    let query = db.from('class_term_rosters').select('student_id, class_id, status');
    if (term?.id) query = query.eq('term_id', term.id);
    const { data: rosters, error: rosterErr } = await query;
    if (rosterErr) throw new Error(rosterErr.message);

    // Map student_id -> class_id for active rosters
    const rosterMap = new Map<string, string>();
    for (const r of rosters ?? []) {
      if (r.student_id && r.class_id && COALESCE_STATUS(r.status)) {
        rosterMap.set(r.student_id, r.class_id);
      }
    }

    // Helper for status check
    function COALESCE_STATUS(st: string | null) {
      return !st || !['withdrawn', 'ended', 'removed'].includes(st.toLowerCase());
    }

    // 3. Update portal_users for mismatched students
    let syncedCount = 0;
    const failures: string[] = [];
    for (const [studentId, classId] of rosterMap.entries()) {
      const { data: pu } = await db
        .from('portal_users')
        .select('id, class_id, is_active, role')
        .eq('id', studentId)
        .maybeSingle();

      if (pu && pu.role === 'student' && pu.is_active && pu.class_id !== classId) {
        try {
          await requireSupabaseWrite(
            db.from('portal_users').update({ class_id: classId }).eq('id', studentId),
            `synchronize class placement for ${studentId}`,
          );
          syncedCount++;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : `Could not place ${studentId}`);
        }
      }
    }

    // 4. Refresh accountability materialised views so cache is instantly updated
    try {
      await requireSupabaseWrite(
        db.rpc('refresh_accountability_cache' as never),
        'refresh accountability cache',
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Accountability cache refresh failed');
    }

    await logAudit(db as any, {
      action: failures.length ? 'sync_accountability_classes_partial' : 'sync_accountability_classes',
      actorId: user.id,
      resourceType: 'accountability',
      resourceId: 'class-placement',
      tableName: 'portal_users',
      newValues: {
        synced_count: syncedCount,
        source: 'active_class_term_rosters',
        failures,
      },
    });
    return NextResponse.json({
      ok: failures.length === 0,
      partial: failures.length > 0,
      synced_count: syncedCount,
      failed_count: failures.length,
      failures,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 });
  }
}
