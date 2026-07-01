import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { requireLiveSessionAccess, LiveSessionAuthError } from '@/lib/live-sessions/authz';

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/live-sessions/[id]/status — lightweight status poll for in-call clients so
// participants leave the room when the host ends/cancels the session.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('id, role, school_id').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const admin = adminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    await requireLiveSessionAccess(admin as any, profile, session);
  } catch (err) {
    if (err instanceof LiveSessionAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ status: session.status });
}
