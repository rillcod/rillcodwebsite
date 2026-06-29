import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canManageLiveSession,
  isSessionJoinWindowOpen,
  LiveSessionAuthError,
  requireLiveSessionAccess,
} from '@/lib/live-sessions/authz';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const APP_ID = process.env.JAAS_APP_ID;
    const KEY_ID = process.env.JAAS_KEY_ID;
    const PEM_RAW = process.env.JAAS_PRIVATE_KEY;
    if (!APP_ID || !KEY_ID || !PEM_RAW) {
      return NextResponse.json({ error: 'JaaS is not configured on this server.' }, { status: 500 });
    }

    const { data: profile } = await supabase
      .from('portal_users')
      .select('id, full_name, role, school_id')
      .eq('id', user.id)
      .single();

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const admin = createAdminClient() as any;
    const { data: session, error: sessionErr } = await admin
      .from('live_sessions')
      .select('id, host_id, school_id, program_id, status, scheduled_at, duration_minutes')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    try {
      await requireLiveSessionAccess(admin, profile, session);
    } catch (err: any) {
      if (err instanceof LiveSessionAuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const isModerator = await canManageLiveSession(admin, profile, session);
    if (!isModerator && !isSessionJoinWindowOpen(session)) {
      return NextResponse.json({ error: 'This session is not open for joining yet.' }, { status: 403 });
    }
    if (isModerator && ['completed', 'cancelled'].includes(String(session.status))) {
      return NextResponse.json({ error: 'This session is no longer active.' }, { status: 400 });
    }

    const displayName = profile?.full_name ?? 'Participant';
    const roomName = `rillcod-${sessionId.slice(0, 12)}`;

    const pem = PEM_RAW.replace(/\\n/g, '\n');
    const privateKey = await importPKCS8(pem, 'RS256');
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
      aud: 'jitsi',
      iss: 'chat',
      sub: APP_ID,
      room: roomName,
      context: {
        user: {
          id:        user.id,
          name:      displayName,
          email:     user.email ?? `${user.id}@rillcod.app`,
          moderator: isModerator,
          avatar:    '',
        },
        features: {
          livestreaming:   false,
          recording:       false,
          transcription:   false,
          'outbound-call': false,
        },
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid: KEY_ID, typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 2)
      .setNotBefore(now - 10)
      .sign(privateKey);

    return NextResponse.json({ token, appId: APP_ID, roomName });
  } catch (err: any) {
    console.error('[jaas-token]', err);
    return NextResponse.json({ error: err.message ?? 'Token generation failed' }, { status: 500 });
  }
}
