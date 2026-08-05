/**
 * POST /api/special-programmes/[offeringId]/bridge
 *
 * Builds a special programme's teaching spine from its own published page:
 * curriculum → release → plan, once per track.
 *
 * Admins only. Send { dry_run: true } to preview.
 *
 * A real run goes through the shared prepareTeaching pipeline, so the cohort
 * class and first class meeting are prepared here exactly as they are on
 * publish. Bridging alone used to leave teachers with plans but no classroom.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bridgeOfferingFromPage } from '@/lib/special-programs/bridge-offering';
import {
  launchContextFromRequest,
  prepareTeaching,
} from '@/lib/academic/prepare-teaching';

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

  if (dryRun) {
    const preview = await bridgeOfferingFromPage(db, {
      offeringId,
      createdBy: user.id,
      dryRun: true,
    });
    if (preview.error) {
      const status = preview.error.includes('not found') ? 404 : 422;
      return NextResponse.json(
        { error: preview.error, detail: preview.detail },
        { status },
      );
    }
    return NextResponse.json({
      data: {
        dry_run: true,
        programme: preview.programme,
        tracks: preview.tracks_preview ?? [],
      },
    });
  }

  const { data: offering } = await db
    .from('academic_offerings')
    .select('special_program_page_id')
    .eq('id', offeringId)
    .maybeSingle();
  const pageId = offering?.special_program_page_id
    ? String(offering.special_program_page_id)
    : null;
  if (!pageId) {
    return NextResponse.json(
      {
        error: 'This programme has no linked page to build from.',
        detail: 'Link the offering to its special programme page, then build again.',
      },
      { status: 422 },
    );
  }

  const prepared = await prepareTeaching({
    pathway: 'special',
    pageId,
    actorId: user.id,
    ...launchContextFromRequest(req),
    forceRebuild: body.force_rebuild === true,
    notifyAdminId: user.id,
  });

  if (prepared.pathway !== 'special') {
    return NextResponse.json({ error: 'Preparation failed' }, { status: 422 });
  }

  if (prepared.error) {
    const status = prepared.error.includes('not found') ? 404 : 422;
    return NextResponse.json(
      { error: prepared.error, detail: prepared.detail },
      { status },
    );
  }

  return NextResponse.json({
    data: {
      programme: prepared.bridge?.programme,
      built: prepared.bridge?.built,
      skipped: prepared.bridge?.skipped,
      failed: prepared.bridge?.failed,
      results: prepared.bridge?.results,
      weeks_started: prepared.weeksStarted,
      warning: prepared.warning,
    },
  });
}
