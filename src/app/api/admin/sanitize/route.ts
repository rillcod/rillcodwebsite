import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import {
  inspectDebris,
  runPurge,
  runSafeRepair,
  sumCounts,
} from '@/lib/admin/platform-sanitation';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).single();
  if (!data || data.role !== 'admin') return null;
  return { id: user.id, full_name: data.full_name };
}

/**
 * POST /api/admin/sanitize
 * Body: { mode: 'inspect' | 'repair' | 'purge' | 'full', dry_run?: boolean, purge_empty_classes?: boolean }
 *
 * full = safe roster repair, then debris purge (both active).
 */
export async function POST(req: Request) {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  let body: {
    mode?: string;
    dry_run?: boolean;
    purge_empty_classes?: boolean;
    purge_hollow_accounts?: boolean;
    min_age_days?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode = body.mode || 'inspect';
  const dryRun = !!body.dry_run;
  const purgeEmptyClasses = body.purge_empty_classes !== false;
  const purgeHollowAccounts = body.purge_hollow_accounts !== false;
  const minAgeDays = typeof body.min_age_days === 'number' && body.min_age_days > 0 ? body.min_age_days : 120;
  const db = createAdminClient();
  const purgeOpts = { dryRun, purgeEmptyClasses, purgeHollowAccounts, minAgeDays };

  if (mode === 'inspect') {
    const debris = await inspectDebris(db, { minAgeDays });
    return NextResponse.json({ mode: 'inspect', debris });
  }

  if (mode === 'repair') {
    const repair = await runSafeRepair(db);
    await logAudit(db, {
      action: 'system_sanitization_repair_executed',
      actorId: actor.id,
      newValues: { actor_name: actor.full_name, ...repair },
    });
    return NextResponse.json({
      success: true,
      mode: 'repair',
      repair,
      message: `Repair done — ${repair.classAssigned} class assignments, ${repair.schoolNamesResynced} school names synced.`,
    });
  }

  if (mode === 'purge') {
    const result = await runPurge(db, purgeOpts);
    if (!dryRun) {
      await logAudit(db, {
        action: 'system_sanitization_purge_executed',
        actorId: actor.id,
        newValues: {
          actor_name: actor.full_name,
          purge_empty_classes: purgeEmptyClasses,
          purge_hollow_accounts: purgeHollowAccounts,
          min_age_days: minAgeDays,
          purged: result.purged,
          items_purged: sumCounts(result.purged),
        },
      });
    }
    return NextResponse.json({
      success: true,
      mode: 'purge',
      dry_run: dryRun,
      would_purge: result.would_purge,
      purged: result.purged,
      message: dryRun
        ? `Dry-run: would purge ${sumCounts(result.would_purge)} item(s).`
        : `Purged ${sumCounts(result.purged)} item(s).`,
    });
  }

  if (mode === 'full') {
    const repair = dryRun
      ? { classAssigned: 0, schoolNamesResynced: 0 }
      : await runSafeRepair(db);
    const result = await runPurge(db, purgeOpts);

    if (!dryRun) {
      await logAudit(db, {
        action: 'system_sanitization_full_executed',
        actorId: actor.id,
        newValues: {
          actor_name: actor.full_name,
          repair,
          purge_empty_classes: purgeEmptyClasses,
          purge_hollow_accounts: purgeHollowAccounts,
          min_age_days: minAgeDays,
          purged: result.purged,
          items_purged: sumCounts(result.purged),
        },
      });
    } else {
      await logAudit(db, {
        action: 'system_sanitization_full_dry_run',
        actorId: actor.id,
        newValues: {
          actor_name: actor.full_name,
          would_purge: result.would_purge,
          purge_empty_classes: purgeEmptyClasses,
          purge_hollow_accounts: purgeHollowAccounts,
          min_age_days: minAgeDays,
          note: 'Repair applies only on execute, not dry-run',
        },
      });
    }

    return NextResponse.json({
      success: true,
      mode: 'full',
      dry_run: dryRun,
      repair,
      would_purge: result.would_purge,
      purged: result.purged,
      message: dryRun
        ? `Dry-run: would purge ${sumCounts(result.would_purge)} item(s) (incl. hollow shells ${minAgeDays}+ days old with no records). Repair runs only on execute.`
        : `Full sanitation: repaired ${repair.classAssigned} class links / ${repair.schoolNamesResynced} names; purged ${sumCounts(result.purged)} item(s).`,
    });
  }

  return NextResponse.json({ error: 'Invalid mode. Use inspect | repair | purge | full.' }, { status: 400 });
}

export async function GET() {
  const actor = await requireAdmin();
  if (!actor) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const debris = await inspectDebris(createAdminClient());
  return NextResponse.json({ debris });
}
