import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const db: any = createAdminClient();
  const { data: proposal } = await db
    .from('academic_curriculum_proposals')
    .select('id, proposed_by, status')
    .eq('id', id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });

  if (actor.role === 'admin') {
    if (!['approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Administrators may approve or reject a pending proposal.' }, { status: 400 });
    }
    const { data, error } = await db
      .from('academic_curriculum_proposals')
      .update({
        status: body.status,
        review_note: typeof body.review_note === 'string' ? body.review_note.trim().slice(0, 2000) : null,
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (proposal.proposed_by !== actor.id || body.status !== 'withdrawn') {
    return NextResponse.json({ error: 'You may only withdraw your own proposal.' }, { status: 403 });
  }
  const { data, error } = await db
    .from('academic_curriculum_proposals')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
