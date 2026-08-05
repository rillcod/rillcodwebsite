/**
 * POST /api/special-programmes/[offeringId]/bridge
 *
 * Builds a special programme's teaching spine from its own published page:
 * curriculum → release → plan, once per track.
 *
 * Admins only. Send { dry_run: true } to preview. Publishing a special
 * programme page also runs this automatically via launchSpecialProgramTeaching.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bridgeOfferingFromPage } from '@/lib/special-programs/bridge-offering';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ offeringId: string }> },
) {
  const { offeringId } = await context.params;

  const sessionClient = await createServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an admin can publish a programme curriculum.' },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const dryRun = body.dry_run === true;

  const result = await bridgeOfferingFromPage(db, {
    offeringId,
    createdBy: user.id,
    dryRun,
  });

  if (result.error) {
    const status = result.error.includes('not found') ? 404 : 422;
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status },
    );
  }

  if (dryRun) {
    return NextResponse.json({
      data: {
        dry_run: true,
        programme: result.programme,
        tracks: result.tracks_preview ?? [],
      },
    });
  }

  return NextResponse.json({
    data: {
      programme: result.programme,
      built: result.built,
      skipped: result.skipped,
      failed: result.failed,
      results: result.results,
    },
  });
}
