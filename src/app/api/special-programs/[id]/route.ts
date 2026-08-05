import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  getSpecialProgramById,
  setFeaturedSpecialProgram,
  specialProgramsAdminClient,
} from '@/lib/special-programs/queries';
import { mapSpecialProgramRow, slugifySpecialProgram } from '@/lib/special-programs/types';
import { shouldLaunchTeachingOnPublish } from '@/lib/special-programs/bridge-offering';
import {
  formatSpecialPrepBlock,
  launchContextFromRequest,
  prepareTeaching,
  queuePrepareTeaching,
  specialPrepBlockers,
} from '@/lib/academic/prepare-teaching';
import {
  readTeachingLaunchStatus,
  summariseLaunchResult,
} from '@/lib/special-programs/teaching-launch-status';
import { buildTeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import {
  ensureCohortClass,
  loadLinkableSchoolClasses,
  loadOfferingClasses,
  pickPrimaryCohort,
  syncOfferingLinks,
} from '@/lib/special-programs/ensure-cohort-class';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await specialProgramsAdminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

async function enrichPageForAdmin(page: ReturnType<typeof mapSpecialProgramRow> | null) {
  if (!page) return null;
  const sb = specialProgramsAdminClient();
  const { data: row } = await sb
    .from('special_program_pages')
    .select('academic_offering_id')
    .eq('id', page.id)
    .maybeSingle();
  const offeringId = row?.academic_offering_id ? String(row.academic_offering_id) : null;
  let schoolId: string | null = null;
  if (offeringId) {
    const { data: offering } = await sb
      .from('academic_offerings')
      .select('school_id')
      .eq('id', offeringId)
      .maybeSingle();
    schoolId = offering?.school_id ? String(offering.school_id) : null;
  }
  const teaching_launch = await readTeachingLaunchStatus(sb, offeringId);
  const offering_classes = offeringId ? await loadOfferingClasses(sb, offeringId) : [];
  const cohort_class = pickPrimaryCohort(offering_classes);
  const linkable_classes =
    schoolId && offeringId ? await loadLinkableSchoolClasses(sb, schoolId, offeringId) : [];
  const readiness = buildTeachingReadiness({
    programId: page.program_id,
    schoolId,
    isPublished: page.is_published,
    startsOn: page.starts_on,
    cohortClass: cohort_class,
  });
  return {
    ...page,
    academic_offering_id: offeringId,
    school_id: schoolId,
    teaching_launch,
    cohort_class,
    offering_classes,
    linkable_classes,
    teaching_readiness: {
      ready: readiness.ready,
      can_prepare: readiness.can_prepare,
      missing: readiness.missing,
      steps: readiness.steps,
    },
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const page = await getSpecialProgramById(id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const admin = await requireAdmin();
    if (!admin && !page.is_published) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (admin) {
      return NextResponse.json({ data: await enrichPageForAdmin(page) });
    }
    return NextResponse.json({ data: page });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const body = await request.json();
    const sb = specialProgramsAdminClient();

    if (body.ensure_cohort_class === true || body.link_cohort_class_id) {
      const result = await ensureCohortClass(sb, {
        pageId: id,
        actorId: admin.id,
        linkClassId:
          typeof body.link_cohort_class_id === 'string' && body.link_cohort_class_id
            ? body.link_cohort_class_id
            : null,
      });
      const page = await enrichPageForAdmin(await getSpecialProgramById(id));
      if (result.error && !result.cohort) {
        return NextResponse.json(
          { data: page, error: result.error, cohort_action: 'error' },
          { status: 422 },
        );
      }
      return NextResponse.json({
        data: page,
        cohort_action: result.created ? 'created' : 'linked',
        cohort_warning: result.error,
      });
    }

    if (body.set_featured === true) {
      const { data: beforeFeature } = await sb
        .from('special_program_pages')
        .select('is_published,program_id')
        .eq('id', id)
        .maybeSingle();
      await setFeaturedSpecialProgram(id);
      const page = await enrichPageForAdmin(await getSpecialProgramById(id));
      const launch = shouldLaunchTeachingOnPublish({
        wasPublished: Boolean(beforeFeature?.is_published),
        nowPublished: true,
      });
      if (launch) {
        if (!beforeFeature?.program_id && !page?.program_id) {
          return NextResponse.json({
            data: page,
            teaching_launch: 'blocked',
            teaching_error:
              'Link a programme before publishing, so teaching materials know which courses to use.',
          });
        }
        if (page?.teaching_readiness && !page.teaching_readiness.can_prepare) {
          return NextResponse.json({
            data: page,
            teaching_launch: 'blocked',
            teaching_error: `Featured, but teaching was not started — finish: ${
              specialPrepBlockers(page.teaching_readiness).join(', ') ||
              page.teaching_readiness.missing.join(', ')
            }.`,
          });
        }
        queuePrepareTeaching({
          pathway: 'special',
          pageId: id,
          actorId: admin.id,
          request,
          schoolId: page?.school_id || null,
        });
      }
      return NextResponse.json({
        data: page,
        teaching_launch: launch ? 'queued' : undefined,
      });
    }

    const { data: before } = await sb
      .from('special_program_pages')
      .select('is_published,program_id')
      .eq('id', id)
      .maybeSingle();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.button_label != null) patch.button_label = String(body.button_label).trim();
    if (body.slug != null) patch.slug = slugifySpecialProgram(String(body.slug));
    if (body.program_id !== undefined) patch.program_id = body.program_id || null;
    if (body.is_published != null) patch.is_published = Boolean(body.is_published);
    if (body.starts_on !== undefined) patch.starts_on = body.starts_on || null;
    if (body.ends_on !== undefined) patch.ends_on = body.ends_on || null;
    if (body.registration_deadline !== undefined) {
      patch.registration_deadline = body.registration_deadline || null;
    }
    if (body.online_fee != null) patch.online_fee = Number(body.online_fee);
    if (body.onsite_fee != null) patch.onsite_fee = Number(body.onsite_fee);
    if (body.deposit_percent != null) patch.deposit_percent = Number(body.deposit_percent);
    if (body.content != null && typeof body.content === 'object') patch.content = body.content;

    if (body.is_featured === true) {
      await sb
        .from('special_program_pages')
        .update({ is_featured: false, updated_at: new Date().toISOString() })
        .eq('is_featured', true);
      patch.is_featured = true;
      patch.is_published = true;
    } else if (body.is_featured === false) {
      patch.is_featured = false;
    }

    const { data, error } = await sb
      .from('special_program_pages')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That URL slug is already in use' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    {
      const { data: pageRow } = await sb
        .from('special_program_pages')
        .select('academic_offering_id')
        .eq('id', id)
        .maybeSingle();
      await syncOfferingLinks(sb, {
        pageId: id,
        offeringId: pageRow?.academic_offering_id ? String(pageRow.academic_offering_id) : null,
        schoolId:
          body.school_id !== undefined
            ? body.school_id || null
            : undefined,
        programmeId:
          body.program_id !== undefined
            ? body.program_id || null
            : data.program_id || null,
      });
    }

    const mapped = mapSpecialProgramRow(data);
    const willPublishLaunch = shouldLaunchTeachingOnPublish({
      wasPublished: Boolean(before?.is_published),
      nowPublished: Boolean(data.is_published),
    });
    const manualLaunch = body.launch_teaching === true && Boolean(data.is_published);
    const programId = data.program_id || before?.program_id;
    const enrichedBeforeLaunch = await enrichPageForAdmin(mapped);
    const readiness = enrichedBeforeLaunch?.teaching_readiness;

    if ((willPublishLaunch || manualLaunch) && !programId) {
      return NextResponse.json(
        {
          data: enrichedBeforeLaunch,
          teaching_launch: 'blocked',
          error:
            'Link a programme before preparing teaching. Choose it under Basics, save, then try again.',
        },
        { status: 422 },
      );
    }

    if (manualLaunch && readiness && !readiness.can_prepare) {
      const detail = formatSpecialPrepBlock(readiness);
      return NextResponse.json(
        {
          data: enrichedBeforeLaunch,
          teaching_launch: 'blocked',
          teaching_error: detail,
          error: detail,
        },
        { status: 422 },
      );
    }

    // Manual Prepare teaching waits for the result so the admin sees success or failure.
    if (manualLaunch) {
      const result = await prepareTeaching({
        pathway: 'special',
        pageId: id,
        actorId: admin.id,
        ...launchContextFromRequest(request),
        forceRebuild: body.force_rebuild === true,
        notifyAdminId: admin.id,
        schoolId:
          body.school_id ||
          enrichedBeforeLaunch?.school_id ||
          null,
      });
      const enriched = await enrichPageForAdmin(mapped);
      if (result.pathway !== 'special' || result.error) {
        return NextResponse.json(
          {
            data: enriched,
            teaching_launch: 'error',
            teaching_error:
              result.pathway === 'special'
                ? summariseLaunchResult(result)
                : result.error || 'Preparation failed',
            teaching_result: result,
          },
          { status: 422 },
        );
      }
      return NextResponse.json({
        data: enriched,
        teaching_launch: 'ok',
        teaching_message: summariseLaunchResult(result),
        teaching_warning: result.warning,
        teaching_result: result,
      });
    }

    if (willPublishLaunch) {
      if (readiness && !readiness.can_prepare) {
        return NextResponse.json({
          data: enrichedBeforeLaunch,
          teaching_launch: 'blocked',
          teaching_error: formatSpecialPrepBlock(readiness, { published: true }),
        });
      }
      queuePrepareTeaching({
        pathway: 'special',
        pageId: id,
        actorId: admin.id,
        request,
        forceRebuild: body.force_rebuild === true,
        schoolId:
          body.school_id ||
          enrichedBeforeLaunch?.school_id ||
          null,
      });
    }

    return NextResponse.json({
      data: await enrichPageForAdmin(mapped),
      teaching_launch: willPublishLaunch ? 'queued' : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    const sb = specialProgramsAdminClient();
    const { error } = await sb.from('special_program_pages').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 });
  }
}
