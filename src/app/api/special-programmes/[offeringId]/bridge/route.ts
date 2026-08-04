/**
 * POST /api/special-programmes/[offeringId]/bridge
 *
 * Builds a special programme's teaching spine from its own published page:
 * curriculum → release → plan, once per track.
 *
 * The programme page already carried the week spine and the advertised topics.
 * Nothing behind it did, so the weekly pipeline had no plan to run on and the
 * content that existed had been made outside it. This closes that gap without
 * asking anyone to retype a syllabus that was already written.
 *
 * Admins only: it publishes curriculum and creates teaching plans.
 * Send { dry_run: true } to see what it would build first.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  bridgeTrack,
  matchTrackToCourse,
  type BridgeOutcome,
  type PageContent,
} from '@/lib/academic/programme-bridge';

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

  const { data: offering } = await db
    .from('academic_offerings')
    .select('id,title,academic_model,status,programme_id,school_id')
    .eq('id', offeringId)
    .maybeSingle();
  if (!offering) {
    return NextResponse.json({ error: 'Programme not found.' }, { status: 404 });
  }
  if (offering.academic_model !== 'duration_programme') {
    return NextResponse.json(
      {
        error: 'This bridge is for duration programmes only.',
        detail: 'A school-term offering builds its curriculum through the academic office.',
      },
      { status: 422 },
    );
  }
  if (!offering.programme_id || !offering.school_id) {
    return NextResponse.json(
      { error: 'This programme must name its programme and school before it can be built.' },
      { status: 422 },
    );
  }

  const { data: page } = await db
    .from('special_program_pages')
    .select('title,content')
    .eq('academic_offering_id', offeringId)
    .maybeSingle();
  const content = (page?.content ?? {}) as PageContent;
  const tracks = Array.isArray(content.tracks) ? content.tracks : [];
  if (!tracks.length) {
    return NextResponse.json(
      {
        error: 'This programme has no published page content to build from.',
        detail: 'The page needs its tracks and week spine before a curriculum can be written.',
      },
      { status: 422 },
    );
  }

  const { data: courses } = await db
    .from('courses')
    .select('id,title')
    .eq('program_id', offering.programme_id);
  const courseList = (courses ?? []).map((c: any) => ({ id: c.id, title: c.title }));

  const { data: period } = await db
    .from('academic_offering_periods')
    .select('id')
    .eq('offering_id', offeringId)
    .order('sequence_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: klass } = await db
    .from('classes')
    .select('id')
    .eq('academic_offering_id', offeringId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dryRun) {
    return NextResponse.json({
      data: {
        dry_run: true,
        programme: offering.title,
        weeks_on_page: Array.isArray(content.weeks) ? content.weeks.length : 0,
        class_id: klass?.id ?? null,
        tracks: tracks.map((t) => {
          const match = matchTrackToCourse(String(t.title ?? ''), courseList);
          return {
            track: t.title ?? '(untitled)',
            topics: (t.topics ?? []).length,
            matched_course: match?.title ?? null,
          };
        }),
      },
    });
  }

  const results: BridgeOutcome[] = [];
  for (const track of tracks) {
    results.push(
      await bridgeTrack(db, {
        track,
        page: content,
        programmeTitle: String(offering.title),
        offeringId,
        offeringPeriodId: period?.id ?? null,
        schoolId: String(offering.school_id),
        classId: klass?.id ?? null,
        createdBy: user.id,
        courses: courseList,
      }),
    );
  }

  const built = results.filter((r) => r.status === 'built').length;
  return NextResponse.json({
    data: {
      programme: offering.title,
      built,
      skipped: results.filter((r) => r.status === 'skipped').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    },
  });
}
