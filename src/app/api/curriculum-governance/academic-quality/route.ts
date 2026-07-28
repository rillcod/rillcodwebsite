import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';
import { runAcademicQualityEngine } from '@/lib/qa/academicQualityEngine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Academic quality checks are managed by the Academic Office.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const curriculumId = typeof body.curriculum_id === 'string' ? body.curriculum_id : '';
  const releaseId = typeof body.release_id === 'string' ? body.release_id : '';
  if (!curriculumId && !releaseId) {
    return NextResponse.json({ error: 'Choose an official curriculum draft or published edition to check.' }, { status: 400 });
  }

  const db: any = createAdminClient();
  let target: any = null;
  if (releaseId) {
    const result = await db
      .from('academic_curriculum_releases')
      .select('id, content, source_metadata, academic_session, audience_label, title')
      .eq('id', releaseId)
      .maybeSingle();
    target = result.data;
  } else {
    const result = await db
      .from('course_curricula')
      .select('id, school_id, content, courses(title)')
      .eq('id', curriculumId)
      .maybeSingle();
    target = result.data;
    if (target?.school_id) {
      return NextResponse.json({ error: 'Choose the central curriculum, not a school working copy.' }, { status: 409 });
    }
  }
  if (!target) return NextResponse.json({ error: 'Curriculum not found.' }, { status: 404 });

  const report = runAcademicQualityEngine(target.content, {
    sourceMetadata: releaseId ? target.source_metadata : body.source_metadata,
    academicSession: releaseId ? target.academic_session : body.academic_session,
    audienceLabel: releaseId ? target.audience_label : body.audience_label,
  });
  const { error } = await db.from('academic_curriculum_quality_runs').insert({
    curriculum_id: releaseId ? null : curriculumId,
    release_id: releaseId || null,
    engine_version: report.engineVersion,
    readiness: report.readiness,
    score: report.score,
    report,
    checked_by: actor.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      ...report,
      note: 'School start term, entry week, and pacing are checked in each school’s delivery schedule and do not weaken the official curriculum.',
    },
  });
}

