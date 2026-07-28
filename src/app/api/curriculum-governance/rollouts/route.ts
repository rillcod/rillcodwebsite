import { NextRequest, NextResponse } from 'next/server';
import {
  applyCurriculumRollout,
  previewCurriculumRollout,
  requireGovernanceActor,
} from '@/lib/curriculum/governance-server';

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
