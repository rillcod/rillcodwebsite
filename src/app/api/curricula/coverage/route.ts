/**
 * GET /api/curricula/coverage
 *
 * Which courses already have a curriculum, and which have an official edition.
 *
 * The builder loads curricula one course at a time (`?course_id=`), so the catalogue
 * tree could never show where the gaps were — you had to click every course to find
 * out. This returns just the counts, no `content`, so the whole catalogue can be
 * annotated in one request.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface CourseCoverage {
  /** course_curricula rows for this course. */
  drafts: number;
  /** A published (not retired) official edition exists. */
  official: boolean;
  /** An edition exists but every one of them is retired. */
  retiredOnly: boolean;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [curriculaRes, releasesRes] = await Promise.all([
    admin.from('course_curricula').select('course_id, school_id'),
    admin.from('academic_curriculum_releases').select('course_id, status'),
  ]);

  const coverage: Record<string, CourseCoverage> = {};
  const touch = (courseId: string) => {
    if (!coverage[courseId]) coverage[courseId] = { drafts: 0, official: false, retiredOnly: false };
    return coverage[courseId];
  };

  // Non-staff only ever see platform-wide or their own school's drafts.
  const isStaff = profile.role === 'admin' || profile.role === 'teacher';
  for (const row of curriculaRes.data ?? []) {
    const r = row as any;
    if (!r.course_id) continue;
    if (!isStaff && r.school_id && r.school_id !== profile.school_id) continue;
    touch(r.course_id).drafts += 1;
  }

  const anyRelease = new Set<string>();
  for (const row of releasesRes.data ?? []) {
    const r = row as any;
    if (!r.course_id) continue;
    anyRelease.add(r.course_id);
    if (r.status !== 'retired') touch(r.course_id).official = true;
  }
  // Flag courses whose only editions are retired — they look certified in a raw count
  // but have nothing live, which stalls their classes.
  for (const courseId of anyRelease) {
    const c = touch(courseId);
    if (!c.official) c.retiredOnly = true;
  }

  return NextResponse.json({
    coverage,
    totals: {
      coursesWithDraft: Object.values(coverage).filter((c) => c.drafts > 0).length,
      coursesWithOfficial: Object.values(coverage).filter((c) => c.official).length,
      coursesRetiredOnly: Object.values(coverage).filter((c) => c.retiredOnly).length,
    },
  });
}
