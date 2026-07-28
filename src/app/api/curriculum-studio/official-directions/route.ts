import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyCurriculumRollout, requireGovernanceActor } from '@/lib/curriculum/governance-server';
import { curriculumContentHash, validateSourceMetadata } from '@/lib/curriculum/governance';
import { humanAcademicSession, humanGradeLabel, humanTermLabel } from '@/lib/curriculum/humanLabels';
import { runAcademicQualityEngine } from '@/lib/qa/academicQualityEngine';

export const dynamic = 'force-dynamic';

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET() {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({
      data: { is_admin: false, message: 'The Academic Office manages official curriculum direction. Your class workspace shows what to teach and lets you customise delivery.' },
    });
  }
  const db: any = createAdminClient();
  const [{ data: curricula }, { data: editions }, { count: suggestions }] = await Promise.all([
    db.from('course_curricula').select('id, course_id, updated_at, courses(title, programs(name))').is('school_id', null).order('updated_at', { ascending: false }),
    db.from('academic_curriculum_releases').select('id, course_id, title, change_summary, status, academic_session, effective_term_number, grade_key, audience_label, quality_status, quality_report, published_at, source_metadata, courses(title, programs(name))').order('published_at', { ascending: false }),
    db.from('academic_curriculum_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return NextResponse.json({
    data: {
      is_admin: true,
      curriculum_drafts: curricula ?? [],
      official_directions: editions ?? [],
      suggestions_waiting: suggestions ?? 0,
    },
  });
}

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only the Academic Office can publish an official academic direction.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const curriculumId = typeof body.curriculum_id === 'string' ? body.curriculum_id : '';
  const academicSession = typeof body.academic_session === 'string' ? body.academic_session.trim() : '';
  const audienceLabel = typeof body.audience_label === 'string' ? body.audience_label.trim() : '';
  const gradeKey = typeof body.grade_key === 'string' ? body.grade_key.trim() : '';
  const effectiveTermNumber = [1, 2, 3].includes(Number(body.effective_term_number)) ? Number(body.effective_term_number) : 1;
  const changeSummary = typeof body.change_summary === 'string' ? body.change_summary.trim() : '';
  if (!curriculumId || !academicSession || !audienceLabel || !changeSummary) {
    return NextResponse.json({ error: 'Choose a curriculum and add the academic session, learner level, and a short explanation of what changed.' }, { status: 400 });
  }
  const sourceCheck = validateSourceMetadata(body.source_metadata);
  if (!sourceCheck.ok) return NextResponse.json({ error: sourceCheck.error }, { status: 400 });

  const db: any = createAdminClient();
  const { data: curriculum } = await db
    .from('course_curricula')
    .select('id, course_id, school_id, content, courses(title, programs(name))')
    .eq('id', curriculumId)
    .maybeSingle();
  if (!curriculum || curriculum.school_id) {
    return NextResponse.json({ error: 'Choose a central Academic Office curriculum draft.' }, { status: 404 });
  }
  const quality = runAcademicQualityEngine(curriculum.content, {
    sourceMetadata: sourceCheck.source,
    academicSession,
    audienceLabel,
  });
  if (quality.readiness === 'not_ready') {
    return NextResponse.json({
      error: quality.heading,
      quality,
    }, { status: 409 });
  }

  const hash = curriculumContentHash(curriculum.content);
  const { data: duplicate } = await db
    .from('academic_curriculum_releases')
    .select('id, title')
    .eq('course_id', curriculum.course_id)
    .eq('content_hash', hash)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json({ error: `This exact academic direction is already protected as “${duplicate.title}”.`, existing_id: duplicate.id }, { status: 409 });
  }
  const { data: latest } = await db.from('academic_curriculum_releases').select('release_number').eq('course_id', curriculum.course_id).order('release_number', { ascending: false }).limit(1).maybeSingle();
  const course: any = relation(curriculum.courses);
  const level = audienceLabel || humanGradeLabel(gradeKey);
  const title = `${course?.title ?? 'Curriculum'} · ${humanAcademicSession(academicSession)} · ${level}`;
  const { data: direction, error } = await db.from('academic_curriculum_releases').insert({
    course_id: curriculum.course_id,
    source_curriculum_id: curriculum.id,
    release_number: Number(latest?.release_number ?? 0) + 1,
    title,
    change_summary: changeSummary.slice(0, 2000),
    content: curriculum.content,
    content_hash: hash,
    source_metadata: sourceCheck.source,
    status: 'published',
    published_by: actor.id,
    academic_session: academicSession,
    effective_term_number: effectiveTermNumber,
    grade_key: gradeKey || null,
    audience_label: audienceLabel,
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from('academic_curriculum_quality_runs').insert({
    curriculum_id: curriculum.id,
    release_id: direction.id,
    engine_version: quality.engineVersion,
    readiness: quality.readiness,
    score: quality.score,
    report: quality,
    checked_by: actor.id,
  });

  // Publishing is the single rollout action. Every school and matching active
  // programme offering receives the direction; existing plans stay immutable.
  const assignment = await applyCurriculumRollout({ releaseId: direction.id, actorId: actor.id });
  return NextResponse.json({
    data: {
      direction,
      quality,
      assignment,
      message: `Official direction protected for ${humanTermLabel(effectiveTermNumber)} and assigned to ${assignment.applied_count} schools and ${assignment.offering_applied_count} unassigned programme pathways. ${assignment.independent_pathways_preserved} existing Online or Special pathway direction(s) were preserved. Existing class plans remain unchanged.`,
    },
  }, { status: 201 });
}

