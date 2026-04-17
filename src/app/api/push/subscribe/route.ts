import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/push/subscribe
// Upserts a Web Push subscription into web_push_subscriptions (Req 1.3)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { subscription, deviceHint } = body;

  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'subscription.endpoint is required' }, { status: 400 });
  }

  const db = createAdminClient();
  const { error } = await db
    .from('web_push_subscriptions')
    .upsert(
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
  return NextResponse.json({});
}
