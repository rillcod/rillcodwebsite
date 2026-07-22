import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getAccountValuables } from '@/lib/students/account-valuables';
import { logAudit } from '@/lib/audit/log';
import { pruneRegistrationArchiveByEmails, wipePortalUserCascade } from '@/lib/students/permanent-wipe';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Hard-wipe soft-deleted portal accounts (hidden users) and every owned record via DB cascade. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const role = typeof body.role === 'string' ? body.role : 'student';
  const confirmDestroy = body.confirmDestroy === true;
  const explicitIds: string[] = Array.isArray(body.ids)
    ? [...new Set((body.ids as unknown[]).filter((x): x is string => typeof x === 'string'))]
    : [];

  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  const { data: caller } = await admin.from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }
  if (caller.role === 'teacher' && role !== 'student') {
    return NextResponse.json({ error: 'Teachers can only purge hidden student accounts' }, { status: 403 });
  }

  let assignedIds: string[] = [];
  if (caller.role === 'teacher') {
    const { data: assignments } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
    assignedIds = (assignments ?? []).map((row: any) => row.school_id).filter(Boolean);
    if (caller.school_id) assignedIds.push(caller.school_id);
  }

  let query = admin
    .from('portal_users')
    .select('id, full_name, email, role, school_id, is_deleted')
    .eq('is_deleted', true)
    .eq('role', role);

  if (explicitIds.length) query = query.in('id', explicitIds) as typeof query;

  const { data: targets, error: loadErr } = await query;
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const scoped = (targets ?? []).filter((row) => {
    if (row.id === caller.id) return false;
    if (caller.role === 'admin') return true;
    return !!row.school_id && assignedIds.includes(row.school_id);
  });

  const deleted: string[] = [];
  const blocked: { id: string; reason: string }[] = [];
  const needsConfirmation: { id: string; name: string; valuables: Awaited<ReturnType<typeof getAccountValuables>> }[] = [];

  for (const row of scoped) {
    if (!confirmDestroy && role === 'student') {
      const { data: sRow } = await admin.from('students').select('id').eq('user_id', row.id).maybeSingle();
      const valuables = await getAccountValuables(admin, row.id, (sRow as { id?: string } | null)?.id ?? null);
      if (valuables.hasValuables) {
        needsConfirmation.push({ id: row.id, name: row.full_name ?? 'Student', valuables });
        continue;
      }
    }

    const wipeResult = await wipePortalUserCascade(admin, row.id);
    if (!wipeResult.ok) {
      blocked.push({ id: row.id, reason: wipeResult.error });
      continue;
    }
    deleted.push(row.id);
  }

  const deletedEmails = scoped.filter((row) => deleted.includes(row.id)).map((row) => row.email).filter(Boolean) as string[];
  if (deletedEmails.length) await pruneRegistrationArchiveByEmails(admin, deletedEmails);

  if (deleted.length) {
    await logAudit(admin as any, {
      action: 'portal_users.purge_hidden',
      actorId: caller.id,
      resourceType: 'portal_user',
      resourceId: null,
      oldValues: { role, deleted_count: deleted.length, explicit: explicitIds.length > 0 },
    });
  }

  return NextResponse.json({ success: true, deleted, blocked, needsConfirmation });
}
