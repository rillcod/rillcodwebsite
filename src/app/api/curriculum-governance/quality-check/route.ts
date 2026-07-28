import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inspectCurriculumQuality } from '@/lib/curriculum/qualityGate';
import { humanTermLabel } from '@/lib/curriculum/humanLabels';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';

export const dynamic = 'force-dynamic';

function humanLocation(location: string): string {
  return location
    .replace(/Programme Year (\d+)/g, 'Year $1')
    .replace(/Term ([1-3])/g, (_, value: string) => humanTermLabel(Number(value)));
}

export async function GET(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only the academic administrator can check an official curriculum draft.' }, { status: 403 });
  }

  const curriculumId = new URL(req.url).searchParams.get('curriculum_id') ?? '';
  if (!curriculumId) {
    return NextResponse.json({ error: 'Choose a curriculum to check.' }, { status: 400 });
  }
  const db: any = createAdminClient();
  const { data: curriculum } = await db
    .from('course_curricula')
    .select('id, school_id, content, courses(title, programs(name))')
    .eq('id', curriculumId)
    .maybeSingle();
  if (!curriculum) return NextResponse.json({ error: 'Curriculum not found.' }, { status: 404 });
  if (curriculum.school_id) {
    return NextResponse.json({ error: 'Choose the central curriculum, not a school working copy.' }, { status: 409 });
  }

  const report = inspectCurriculumQuality(curriculum.content);
  const humanize = (issue: { level: string; location: string; message: string }) => ({
    ...issue,
    location: humanLocation(issue.location),
  });
  const course = Array.isArray(curriculum.courses) ? curriculum.courses[0] : curriculum.courses;

  return NextResponse.json({
    data: {
      ready: report.passed,
      heading: report.passed ? 'Ready to become the official academic direction' : 'A few academic gaps need attention',
      message: report.passed
        ? `The ${course?.title ?? 'curriculum'} structure is complete. Warnings are helpful improvements and do not block publication.`
        : 'Correct the items marked “Must fix”. Schools can still begin in a different term or week; that timing is configured separately.',
      programme: course?.programs?.name ?? null,
      course: course?.title ?? null,
      coverage: `${report.termCount} curriculum sections and ${report.weekCount} teaching weeks checked`,
      must_fix: report.errors.map(humanize),
      suggestions: report.warnings.map(humanize),
    },
  });
}

