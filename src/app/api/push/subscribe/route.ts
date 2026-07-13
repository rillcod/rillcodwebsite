import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/push/subscribe
// Web Push: { subscription, deviceHint }
// Native Capacitor: { kind: 'native', token, platform: 'android'|'ios', deviceHint }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = createAdminClient();

  if (body.kind === 'native' || body.token) {
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = body.platform === 'ios' ? 'ios' : body.platform === 'android' ? 'android' : null;
    if (!token || !platform) {
      return NextResponse.json(
        { error: 'token and platform (android|ios) are required for native push' },
        { status: 400 },
      );
    }

    const { error } = await db.from('device_push_tokens').upsert(
      {
        portal_user_id: user.id,
        token,
        platform,
        device_hint: body.deviceHint ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: 'native' });
  }

  const { subscription, deviceHint } = body;
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'subscription.endpoint is required' }, { status: 400 });
  }

  const { error } = await db.from('web_push_subscriptions').upsert(
    {
      portal_user_id: user.id,
      endpoint: subscription.endpoint,
      subscription_json: subscription,
      device_hint: deviceHint ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, kind: 'web' });
}
