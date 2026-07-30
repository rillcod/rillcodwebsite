import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  classifyCurriculumChange,
  normalizeChangedPaths,
  proposalInitialStatus,
  type CurriculumProposalScope,
} from '@/lib/curriculum/governance';
import {
  actorSchoolIds,
  requireGovernanceActor,
} from '@/lib/curriculum/governance-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  const db: any = createAdminClient();
  const status = new URL(req.url).searchParams.get('status');
  let query = db
    .from('academic_curriculum_proposals')
    .select('*, courses(title), schools(name), classes!class_id(name), proposed_by_user:portal_users!academic_curriculum_proposals_proposed_by_fkey(full_name, email)')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  if (actor.role === 'teacher') query = query.eq('proposed_by', actor.id);
  if (actor.role === 'school') {
    if (!actor.school_id) return NextResponse.json({ data: [] });
    query = query.eq('school_id', actor.school_id);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (!['teacher', 'admin'].includes(actor.role)) {
    return NextResponse.json({ error: 'Teachers propose changes; school users review adopted direction.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const courseId = typeof body.course_id === 'string' ? body.course_id : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : '';
  const requestedScope: CurriculumProposalScope = ['class', 'school', 'official'].includes(body.requested_scope)
    ? body.requested_scope
    : 'official';
  const schoolId = typeof body.school_id === 'string' ? body.school_id : null;
  const classId = typeof body.class_id === 'string' ? body.class_id : null;
  if (!courseId || !title || !rationale) {
    return NextResponse.json({ error: 'course_id, title and rationale are required.' }, { status: 400 });
  }
  if (requestedScope !== 'official' && !schoolId) {
    return NextResponse.json({ error: 'A school is required for class or school proposals.' }, { status: 400 });
  }
  if (requestedScope === 'class' && !classId) {
    return NextResponse.json({ error: 'A class is required for class adaptations.' }, { status: 400 });
  }

  const db: any = createAdminClient();
  if (actor.role === 'teacher') {
    const allowedSchools = await actorSchoolIds(actor);
    if (schoolId && !allowedSchools.includes(schoolId)) {
      return NextResponse.json({ error: 'You can only propose changes for an assigned school.' }, { status: 403 });
    }
    if (classId) {
      const { data: klass } = await db.from('classes').select('id, school_id, teacher_id, program_id').eq('id', classId).maybeSingle();
      const { data: course } = await db.from('courses').select('program_id').eq('id', courseId).maybeSingle();
      if (!klass || klass.teacher_id !== actor.id || klass.school_id !== schoolId) {
        return NextResponse.json({ error: 'This class is not assigned to you in the selected school.' }, { status: 403 });
      }
      if (klass.program_id && course?.program_id && klass.program_id !== course.program_id) {
        return NextResponse.json({ error: 'The class and course belong to different programmes.' }, { status: 400 });
      }
    }
  }

  const changedPaths = normalizeChangedPaths(body.changed_paths);
  const classification = classifyCurriculumChange(changedPaths, requestedScope);
  const status = proposalInitialStatus(classification, requestedScope);
  const { data, error } = await db
    .from('academic_curriculum_proposals')
    .insert({
      curriculum_id: typeof body.curriculum_id === 'string' ? body.curriculum_id : null,
      release_id: typeof body.release_id === 'string' ? body.release_id : null,
      school_id: schoolId,
      class_id: classId,
      course_id: courseId,
      proposed_by: actor.id,
      requested_scope: requestedScope,
      title: title.slice(0, 200),
      rationale: rationale.slice(0, 4000),
      changed_paths: changedPaths,
      proposal_data: body.proposal_data && typeof body.proposal_data === 'object' ? body.proposal_data : {},
      policy_classification: classification,
      status,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
