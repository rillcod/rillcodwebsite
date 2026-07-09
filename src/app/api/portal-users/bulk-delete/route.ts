import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getAccountValuables } from '@/lib/students/account-valuables';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// POST /api/portal-users/bulk-delete
// Tick-and-wipe: hard-delete many STUDENT accounts at once (built for cleaning out
// withdrawn students). Same guards as the single delete —
//   • caller must be admin or teacher
//   • teachers may only delete STUDENTS from their assigned school(s)
//   • paid ID cards / published reports are protected: those ids come back under
//     `needsConfirmation` (with what would be lost) unless { confirmDestroy: true }.
// Body: { ids: string[]; confirmDestroy?: boolean }
// Returns: { deleted: string[]; blocked: {id,reason}[]; needsConfirmation: {id,name,valuables}[] }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === 'string'))]
    : [];
  const confirmDestroy = body.confirmDestroy === true;

  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase.from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  if (ids.length === 0) return NextResponse.json({ error: 'No accounts selected.' }, { status: 400 });

  const admin = adminClient();

  // For teachers, pre-compute the set of schools they may act within.
  let assignedIds: string[] = [];
  if (caller.role === 'teacher') {
    const { data: assignments } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
    assignedIds = (assignments ?? []).map((a: any) => a.school_id).filter(Boolean);
    if (caller.school_id) assignedIds.push(caller.school_id);
  }

  const deleted: string[] = [];
  const blocked: { id: string; reason: string }[] = [];
  const needsConfirmation: { id: string; name: string; valuables: Awaited<ReturnType<typeof getAccountValuables>> }[] = [];

  for (const id of ids) {
    if (id === caller.id) { blocked.push({ id, reason: 'You cannot delete your own account.' }); continue; }

    const { data: pu } = await admin.from('portal_users').select('role, school_id, full_name').eq('id', id).maybeSingle();
    if (!pu) { blocked.push({ id, reason: 'Account not found (already removed).' }); continue; }

    // This endpoint is student-focused (withdrawn cleanup). Teacher/parent/school accounts
    // must go through the single-delete flow that handles class reassignment etc.
    if (pu.role !== 'student') { blocked.push({ id, reason: 'Only student accounts can be bulk-deleted here.' }); continue; }

    if (caller.role === 'teacher' && (!pu.school_id || !assignedIds.includes(pu.school_id))) {
      blocked.push({ id, reason: 'Outside your assigned school.' }); continue;
    }

    // Safety gate — don't quietly destroy paid cards / published reports.
    if (!confirmDestroy) {
      const { data: sRow } = await admin.from('students').select('id').eq('user_id', id).maybeSingle();
      const valuables = await getAccountValuables(admin, id, (sRow as any)?.id ?? null);
      if (valuables.hasValuables) {
        needsConfirmation.push({ id, name: pu.full_name ?? 'Student', valuables });
        continue;
      }
    }

    const { error: wipeErr } = await (admin as any).rpc('hard_delete_portal_user', { p_id: id });
    if (wipeErr) { blocked.push({ id, reason: wipeErr.message }); continue; }
    await admin.auth.admin.deleteUser(id).catch(() => {});
    deleted.push(id);
  }

  return NextResponse.json({ success: true, deleted, blocked, needsConfirmation });
}
