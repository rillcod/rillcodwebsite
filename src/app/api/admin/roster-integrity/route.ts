import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSpecializedProgramRecord } from '@/lib/students/reinstate-to-class';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type ScanResult = {
  checked_students: number;
  stale_roster_ids: string[];
  affected_class_ids: string[];
  stale_enrollment_ids: string[];
};

async function scanRosterIntegrity(admin: ReturnType<typeof createAdminClient>): Promise<ScanResult> {
  const { data: activeRosters, error: rErr } = await (admin as any)
    .from('class_term_rosters')
    .select('id, student_id, class_id, status, classes:class_id(name)')
    .eq('status', 'active')
    .limit(5000);
  if (rErr) throw new Error(rErr.message);

  const { data: students, error: sErr } = await admin
    .from('portal_users')
    .select('id, class_id, enrollment_type, classes:class_id(id, name, program_id)')
    .eq('role', 'student')
    .not('class_id', 'is', null)
    .limit(5000);
  if (sErr) throw new Error(sErr.message);

  const regularMap = new Map<string, { class_id: string; program_id: string | null }>();
  for (const s of (students ?? []) as any[]) {
    if (!s.class_id) continue;
    const clsName = s.classes?.name || '';
    if (isSpecializedProgramRecord(s.enrollment_type, clsName)) continue;
    regularMap.set(s.id, {
      class_id: s.class_id,
      program_id: s.classes?.program_id ?? null,
    });
  }

  const staleRosterIds: string[] = [];
  const affectedClassIds = new Set<string>();
  for (const row of (activeRosters ?? []) as any[]) {
    const st = regularMap.get(row.student_id);
    if (!st) continue;
    if (row.class_id === st.class_id) continue;
    if (isSpecializedProgramRecord(null, row.classes?.name)) continue;
    staleRosterIds.push(row.id);
    if (row.class_id) affectedClassIds.add(row.class_id);
  }

  const regularIds = Array.from(regularMap.keys());
  const staleEnrollmentIds: string[] = [];
  for (let i = 0; i < regularIds.length; i += 200) {
    const chunk = regularIds.slice(i, i + 200);
    const { data: enrs } = await admin
      .from('enrollments')
      .select('id, user_id, program_id, status')
      .in('user_id', chunk)
      .in('status', ['active', 'enrolled', 'approved']);
    for (const e of (enrs ?? []) as any[]) {
      const expected = regularMap.get(e.user_id)?.program_id;
      if (expected && e.program_id && e.program_id !== expected) {
        staleEnrollmentIds.push(e.id);
      }
    }
  }

  return {
    checked_students: regularMap.size,
    stale_roster_ids: staleRosterIds,
    affected_class_ids: Array.from(affectedClassIds),
    stale_enrollment_ids: staleEnrollmentIds,
  };
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const admin = createAdminClient();
  const { data: caller } = await admin
    .from('portal_users')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (caller?.role !== 'admin') return null;
  return { admin, caller };
}

/**
 * GET /api/admin/roster-integrity
 * Read-only scan across regular-school students — NEVER mutates data.
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: 'Administrators only' }, { status: 403 });
    const scan = await scanRosterIntegrity(auth.admin);
    return NextResponse.json(
      {
        ok: true,
        checked_students: scan.checked_students,
        stale_rosters_count: scan.stale_roster_ids.length,
        stale_enrollments_count: scan.stale_enrollment_ids.length,
        affected_classes_count: scan.affected_class_ids.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Integrity scan failed' }, { status: 500 });
  }
}

/**
 * POST /api/admin/roster-integrity
 * { confirm: true }
 * Explicit, admin-triggered repair of stale regular-class rosters & enrollments.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: 'Administrators only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) {
      return NextResponse.json({ error: 'Explicit confirm: true is required to run repair.' }, { status: 400 });
    }

    const scan = await scanRosterIntegrity(auth.admin);
    const nowIso = new Date().toISOString();

    for (let i = 0; i < scan.stale_roster_ids.length; i += 100) {
      const chunk = scan.stale_roster_ids.slice(i, i + 100);
      await (auth.admin as any)
        .from('class_term_rosters')
        .update({ status: 'withdrawn', ended_at: nowIso, updated_by: auth.caller.id })
        .in('id', chunk);
    }

    for (const cid of scan.affected_class_ids) {
      const { data: cnt } = await (auth.admin as any).rpc('active_class_student_count', { p_class_id: cid });
      await auth.admin.from('classes').update({ current_students: Number(cnt ?? 0) }).eq('id', cid);
    }

    for (let i = 0; i < scan.stale_enrollment_ids.length; i += 100) {
      const chunk = scan.stale_enrollment_ids.slice(i, i + 100);
      await auth.admin
        .from('enrollments')
        .update({ status: 'completed', updated_at: nowIso })
        .in('id', chunk);
    }

    await logAudit(auth.admin as any, {
      actorId: auth.caller.id,
      action: 'admin_roster_integrity_repair',
      resourceType: 'roster_integrity',
      newValues: {
        checked_students: scan.checked_students,
        withdrawn_rosters: scan.stale_roster_ids.length,
        completed_enrollments: scan.stale_enrollment_ids.length,
        resynced_classes: scan.affected_class_ids.length,
      },
    });

    return NextResponse.json({
      ok: true,
      checked_students: scan.checked_students,
      withdrawn_rosters: scan.stale_roster_ids.length,
      completed_enrollments: scan.stale_enrollment_ids.length,
      message: `Integrity check complete: ${scan.stale_roster_ids.length} stale roster(s) withdrawn and ${scan.stale_enrollment_ids.length} stale enrollment(s) completed.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Integrity repair failed' }, { status: 500 });
  }
}
