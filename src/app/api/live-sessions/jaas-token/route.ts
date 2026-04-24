import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, importPKCS8 } from 'jose';
import { createClient } from '@/lib/supabase/server';

const APP_ID  = process.env.JAAS_APP_ID!;
const KEY_ID  = process.env.JAAS_KEY_ID!;
const PEM_RAW = process.env.JAAS_PRIVATE_KEY!;

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

    const pem = PEM_RAW.replace(/\\n/g, '\n');
    const privateKey = await importPKCS8(pem, 'RS256');
    const now = Math.floor(Date.now() / 1000);

    const token = await new SignJWT({
      aud: 'jitsi',
      iss: 'chat',
      sub: APP_ID,
      room: '*',
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
      .setExpirationTime(now + 60 * 60 * 4)
      .setNotBefore(now - 10)
      .sign(privateKey);

    return NextResponse.json({ token, appId: APP_ID });
  } catch (err: any) {
    console.error('[jaas-token]', err);
    return NextResponse.json({ error: err.message ?? 'Token generation failed' }, { status: 500 });
  }
}
