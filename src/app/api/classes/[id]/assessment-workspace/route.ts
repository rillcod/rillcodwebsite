import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ClassAssessmentWorkspaceError,
  loadClassAssessmentWorkspace,
} from '@/lib/academic/class-assessment-workspace';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: actor, error: actorError } = await db
    .from('portal_users')
    .select('id,role,school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (actorError) {
    console.error('[class-assessment-workspace] actor lookup failed', actorError);
    return NextResponse.json(
      { error: 'Your account could not be verified. Please retry.' },
      { status: 503 },
    );
  }
  if (!actor) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  try {
    const { id } = await context.params;
    const data = await loadClassAssessmentWorkspace(db as any, id, actor);
    return NextResponse.json({ data });
  } catch (cause) {
    if (cause instanceof ClassAssessmentWorkspaceError) {
      return NextResponse.json({ error: cause.message }, { status: cause.status });
    }
    console.error('[class-assessment-workspace] unexpected failure', cause);
    return NextResponse.json(
      { error: 'The class assessment record could not be loaded. Please retry.' },
      { status: 500 },
    );
  }
}
