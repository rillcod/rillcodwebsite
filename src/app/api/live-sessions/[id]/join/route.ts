import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

// POST /api/live-sessions/[id]/join — Record attendance for joining student
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Check if session exists
  const { data: session, error: sErr } = await supabase
    .from('live_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single();

  if (sErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // 2. Record attendance entry
  // We use upsert to avoid duplicate entries for the same join
  const { data: attendance, error: aErr } = await supabase
    .from('live_session_attendance')
    .upsert([
      {
        session_id: sessionId,
        portal_user_id: user.id,
        joined_at: new Date().toISOString(),
      }
    ], { onConflict: 'session_id, portal_user_id' })
    .select()
    .single();

  if (aErr) {
    console.error('Error recording attendance:', aErr);
    // Continue anyway as we don't want to block the user joining
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Attendance recorded',
    data: attendance 
  });
}
