/**
 * Schools left pointing at a retired edition.
 *
 * Retiring an edition does not clear the adoptions made from it, so a school can hold an
 * adoption whose edition is dead. It reads as "distributed" everywhere while the school
 * actually has no live direction to teach from — and nothing in the app surfaced it.
 *
 * GET  lists them, grouped by course, saying whether a live edition exists to move to.
 * POST re-points a course's stranded schools onto its live edition, through the same
 *      applyCurriculumRollout path that publishing uses, so the records are built
 *      identically to a normal rollout.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { applyCurriculumRollout } from '@/lib/curriculum/governance-server';

export const dynamic = 'force-dynamic';

async function requireAdminOrTeacher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

/** Adoptions whose edition is retired, grouped by course. */
async function findStranded(admin: any) {
  const [{ data: releases }, { data: adoptions }] = await Promise.all([
    admin.from('academic_curriculum_releases').select('id, course_id, title, status, release_number, published_at'),
    admin.from('academic_curriculum_adoptions').select('id, school_id, course_id, release_id, status'),
  ]);

  const releaseById = new Map<string, any>((releases ?? []).map((r: any) => [r.id, r]));
  const liveByCourse = new Map<string, any>();
  for (const r of releases ?? []) {
    if (r.status !== 'retired' && r.course_id) {
      const current = liveByCourse.get(r.course_id);
      if (!current || (r.release_number ?? 0) > (current.release_number ?? 0)) liveByCourse.set(r.course_id, r);
    }
  }

  const groups = new Map<string, {
    courseId: string;
    retiredEdition: { id: string; title: string; release_number: number | null };
    schoolIds: string[];
    liveEdition: { id: string; title: string; release_number: number | null } | null;
  }>();

  for (const a of adoptions ?? []) {
    const rel = a.release_id ? releaseById.get(a.release_id) : null;
    if (!rel || rel.status !== 'retired') continue;
    const key = `${a.course_id}:${rel.id}`;
    if (!groups.has(key)) {
      const live = a.course_id ? liveByCourse.get(a.course_id) : null;
      groups.set(key, {
        courseId: a.course_id,
        retiredEdition: { id: rel.id, title: rel.title, release_number: rel.release_number ?? null },
        schoolIds: [],
        liveEdition: live ? { id: live.id, title: live.title, release_number: live.release_number ?? null } : null,
      });
    }
    if (a.school_id && !groups.get(key)!.schoolIds.includes(a.school_id)) {
      groups.get(key)!.schoolIds.push(a.school_id);
    }
  }
  return [...groups.values()];
}

export async function GET() {
  const caller = await requireAdminOrTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient() as any;

  const groups = await findStranded(admin);
  const courseIds = [...new Set(groups.map((g) => g.courseId).filter(Boolean))];
  const schoolIds = [...new Set(groups.flatMap((g) => g.schoolIds))];

  const [{ data: courses }, { data: schools }] = await Promise.all([
    courseIds.length ? admin.from('courses').select('id, title').in('id', courseIds) : { data: [] },
    schoolIds.length ? admin.from('schools').select('id, name').in('id', schoolIds) : { data: [] },
  ]);
  const courseName = new Map((courses ?? []).map((c: any) => [c.id, c.title]));
  const schoolName = new Map((schools ?? []).map((s: any) => [s.id, s.name]));

  return NextResponse.json({
    groups: groups.map((g) => ({
      courseId: g.courseId,
      courseTitle: courseName.get(g.courseId) ?? 'Unknown course',
      retiredEdition: g.retiredEdition,
      liveEdition: g.liveEdition,
      schools: g.schoolIds.map((id) => ({ id, name: schoolName.get(id) ?? 'Unknown school' })),
      // Without a live edition there is nothing to move onto; the course needs
      // certifying again before these schools can be recovered.
      resolvable: !!g.liveEdition,
    })),
    totals: {
      groups: groups.length,
      schools: schoolIds.length,
      resolvable: groups.filter((g) => g.liveEdition).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const caller = await requireAdminOrTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can re-point school adoptions.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const courseId: string | undefined = body?.courseId;
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 });

  const admin = createAdminClient() as any;
  const group = (await findStranded(admin)).find((g) => g.courseId === courseId);
  if (!group) return NextResponse.json({ error: 'Nothing stranded for that course.' }, { status: 404 });
  if (!group.liveEdition) {
    return NextResponse.json(
      { error: 'That course has no live edition to move these schools onto. Certify a new edition first.' },
      { status: 409 },
    );
  }

  // Same path publishing uses, so adoptions and offering directions are written
  // consistently rather than patched by hand.
  const assignment = await applyCurriculumRollout({
    releaseId: group.liveEdition.id,
    schoolIds: group.schoolIds,
    actorId: caller.id,
  });

  return NextResponse.json({
    success: true,
    movedTo: group.liveEdition,
    requestedSchools: group.schoolIds.length,
    assignment,
  });
}

/**
 * DELETE — drop the stale adoptions instead of moving them.
 *
 * When the retired edition is the only one a course ever had there is nothing to move
 * onto, so the honest state is "not distributed" rather than an adoption pointing at a
 * dead edition. Only rows whose edition is genuinely retired are touched; live adoptions
 * are never in the result set.
 */
export async function DELETE(req: NextRequest) {
  const caller = await requireAdminOrTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can clear school adoptions.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const courseId: string | undefined = body?.courseId;
  if (!courseId) return NextResponse.json({ error: 'courseId is required' }, { status: 400 });

  const admin = createAdminClient() as any;
  const group = (await findStranded(admin)).find((g) => g.courseId === courseId);
  if (!group) return NextResponse.json({ error: 'Nothing stranded for that course.' }, { status: 404 });

  const { error: adoptErr, count: removedAdoptions } = await admin
    .from('academic_curriculum_adoptions')
    .delete({ count: 'exact' })
    .eq('course_id', courseId)
    .eq('release_id', group.retiredEdition.id);
  if (adoptErr) return NextResponse.json({ error: adoptErr.message }, { status: 500 });

  // Offering directions built from the same dead edition are equally stale.
  const { error: dirErr, count: removedDirections } = await admin
    .from('academic_offering_curriculum_directions')
    .delete({ count: 'exact' })
    .eq('release_id', group.retiredEdition.id);
  if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    clearedEdition: group.retiredEdition,
    removedAdoptions: removedAdoptions ?? 0,
    removedDirections: removedDirections ?? 0,
  });
}
