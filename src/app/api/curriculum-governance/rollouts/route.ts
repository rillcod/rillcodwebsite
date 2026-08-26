import { NextRequest, NextResponse } from 'next/server';
import {
  applyCurriculumRollout,
  previewCurriculumRollout,
  requireGovernanceActor,
} from '@/lib/curriculum/governance-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only the academic administrator can roll out official curricula.' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const releaseId = typeof body.release_id === 'string' ? body.release_id : '';
  if (!releaseId) return NextResponse.json({ error: 'release_id is required.' }, { status: 400 });
  const schoolIds = Array.isArray(body.school_ids)
    ? body.school_ids.filter((id: unknown): id is string => typeof id === 'string')
    : undefined;
  try {
    const data = body.dry_run === false
      ? await applyCurriculumRollout({ releaseId, schoolIds, actorId: actor.id })
      : await previewCurriculumRollout({ releaseId, schoolIds });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Rollout failed.' }, { status: 400 });
  }
}

/**
 * Change one school's preference for future curriculum editions.
 *
 * This never changes a lesson plan that already exists. It only tells the next
 * rollout whether this school should move automatically or wait for a person.
 */
export async function PATCH(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only the academic administrator can change school curriculum updates.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const adoptionId = typeof body.adoption_id === 'string' ? body.adoption_id.trim() : '';
  if (!adoptionId || typeof body.auto_update !== 'boolean') {
    return NextResponse.json({ error: 'Choose a school assignment and an update preference.' }, { status: 400 });
  }

  const db: any = createAdminClient();
  const { data: current, error: readError } = await db
    .from('academic_curriculum_adoptions')
    .select('id,school_id,course_id,release_id,auto_update,status')
    .eq('id', adoptionId)
    .maybeSingle();
  if (readError || !current) {
    return NextResponse.json({ error: 'That school curriculum assignment could not be found.' }, { status: 404 });
  }

  const { data: updated, error: updateError } = await db
    .from('academic_curriculum_adoptions')
    .update({ auto_update: body.auto_update, updated_at: new Date().toISOString() })
    .eq('id', adoptionId)
    .select('id,school_id,course_id,release_id,auto_update,status')
    .single();
  if (updateError) {
    return NextResponse.json({ error: 'The school update preference could not be saved.' }, { status: 500 });
  }

  await logAudit(db, {
    action: 'change_curriculum_auto_update',
    actorId: actor.id,
    resourceType: 'academic_curriculum_adoption',
    resourceId: adoptionId,
    tableName: 'academic_curriculum_adoptions',
    recordId: adoptionId,
    oldValue: current.auto_update === false ? 'Manual curriculum updates' : 'Automatic curriculum updates',
    newValue: body.auto_update ? 'Automatic curriculum updates' : 'Manual curriculum updates',
    oldValues: { auto_update: current.auto_update !== false },
    newValues: { auto_update: body.auto_update },
  });

  return NextResponse.json({
    data: updated,
    message: body.auto_update
      ? 'This school will receive future approved curriculum editions automatically.'
      : 'This school will stay on its current edition until an administrator changes it.',
  });
}
