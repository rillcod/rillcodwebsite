import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@/lib/supabase/server';

const API_KEY    = process.env.LIVEKIT_API_KEY!;
const API_SECRET = process.env.LIVEKIT_API_SECRET!;

// POST /api/live-sessions/livekit-token
// Body: { sessionId: string }
// Returns: { token: string, url: string, roomName: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const { data: profile } = await supabase
      .from('portal_users')
      .select('full_name, role')
      .eq('id', user.id)
      .single();

    const isModerator = profile?.role === 'admin' || profile?.role === 'teacher';
    const displayName = profile?.full_name ?? 'Participant';
    const roomName    = `rillcod-${sessionId.slice(0, 12)}`;
    const identity    = user.id;

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: displayName,
      ttl: '4h',
    });

    at.addGrant({
      roomJoin:       true,
      room:           roomName,
      canPublish:     true,
      canSubscribe:   true,
      canPublishData: true,
      // Moderator gets room admin privileges
      roomAdmin:      isModerator,
      roomCreate:     isModerator,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url:      process.env.LIVEKIT_URL,
      roomName,
      isModerator,
      displayName,
    });
  } catch (err: any) {
    console.error('[livekit-token]', err);
    return NextResponse.json({ error: err.message ?? 'Token generation failed' }, { status: 500 });
  }
}
