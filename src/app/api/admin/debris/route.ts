import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { inspectDebris, runPurge, sumCounts } from '@/lib/admin/platform-sanitation';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).single();
  if (!data || data.role !== 'admin') return null;
  return { id: user.id, full_name: data.full_name };
}

// GET /api/admin/debris — inspect debris for system sanitization
export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const debris = await inspectDebris(createAdminClient());
  return NextResponse.json({ debris });
}

// DELETE /api/admin/debris — purge debris (empty classes included when purge_empty_classes=1)
export async function DELETE(req: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const purgeEmptyClasses =
    url.searchParams.get('purge_empty_classes') === '1' ||
    url.searchParams.get('purge_empty_classes') === 'true' ||
    url.searchParams.get('type') === 'all';

  const db = createAdminClient();
  const result = await runPurge(db, { actorId: actor.id, dryRun, purgeEmptyClasses });

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      would_purge: result.would_purge,
    });
  }

  await logAudit(db, {
    action: 'system_sanitization_purge_executed',
    actorId: actor.id,
    newValues: {
      actor_name: actor.full_name,
      purge_empty_classes: purgeEmptyClasses,
      purged: result.purged,
      items_purged: sumCounts(result.purged),
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    success: true,
    message: `System sanitized: purged ${sumCounts(result.purged)} item(s).`,
    purged_count: sumCounts(result.purged),
    purged: result.purged,
  });
}
