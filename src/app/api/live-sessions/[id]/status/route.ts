import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  requireLiveSessionUser,
  requireLiveSessionAccess,
  LiveSessionAuthError,
} from '@/lib/live-sessions/authz';

// GET /api/live-sessions/[id]/status — lightweight status poll for in-call clients so
// participants leave the room when the host ends/cancels the session.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await requireLiveSessionUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createEngagementAdminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    await requireLiveSessionAccess(admin as any, caller, session);
  } catch (err) {
    if (err instanceof LiveSessionAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ status: session.status });
}
