import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/audit/log';
import { requireSupabaseResult, requireSupabaseWrite } from '@/lib/supabase/require-result';
import { resolveActiveRosterPlacements } from '@/lib/accountability/class-placement';

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
    const { data: term, error: termError } = await db
      .from('academic_terms')
      .select('id')
      .eq('is_current', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (termError) throw new Error(`Load current term: ${termError.message}`);
    if (!term?.id) {
      return NextResponse.json({ error: 'No current academic term is configured. Class placement was not changed.' }, { status: 409 });
    }

    // 2. Fetch active term rosters
    const query = db.from('class_term_rosters').select('student_id, class_id, status').eq('term_id', term.id);
    const { data: rosters, error: rosterErr } = await query;
    if (rosterErr) throw new Error(rosterErr.message);

    // Map student_id -> class_id for active rosters
    const { placements: rosterMap, conflicts } = resolveActiveRosterPlacements(rosters ?? []);

    // 3. Update portal_users for mismatched students
    let syncedCount = 0;
    const failures: string[] = [...conflicts].map(studentId => `Conflicting active roster classes for ${studentId}; no placement changed.`);
    for (const [studentId, classId] of rosterMap.entries()) {
      const { data: pu, error: userError } = await db
        .from('portal_users')
        .select('id, class_id, is_active, role')
        .eq('id', studentId)
        .maybeSingle();
      if (userError) {
        failures.push(`Load student ${studentId}: ${userError.message}`);
        continue;
      }

      if (pu && pu.role === 'student' && pu.is_active && pu.class_id !== classId) {
        try {
          const updated = await requireSupabaseResult(
            db.from('portal_users')
              .update({ class_id: classId })
              .eq('id', studentId)
              .eq('role', 'student')
              .eq('is_active', true)
              .eq('is_deleted', false)
              .select('id')
              .maybeSingle(),
            `synchronize class placement for ${studentId}`,
          );
          if (!updated) throw new Error(`Student ${studentId} changed while class placement was being synchronized.`);
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
        term_id: term.id,
        roster_count: rosters?.length ?? 0,
        conflict_count: conflicts.size,
        source: 'active_class_term_rosters',
        failures,
      },
    });
    return NextResponse.json({
      ok: failures.length === 0,
      partial: failures.length > 0,
      synced_count: syncedCount,
      term_id: term.id,
      roster_count: rosters?.length ?? 0,
      conflict_count: conflicts.size,
      failed_count: failures.length,
      failures,
    });
  } catch (e) {
    await logAudit(db as any, {
      action: 'sync_accountability_classes_failed',
      actorId: user.id,
      resourceType: 'accountability',
      resourceId: 'class-placement',
      newValue: e instanceof Error ? e.message : 'Sync failed',
    });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 });
  }
}
