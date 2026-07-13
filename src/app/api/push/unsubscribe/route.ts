import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// DELETE /api/push/unsubscribe
// Web: { endpoint } | Native: { token }
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = createAdminClient();

  if (body.token) {
    const { error } = await db
      .from('device_push_tokens')
      .delete()
      .eq('token', body.token)
      .eq('portal_user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { endpoint } = body;
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint or token is required' }, { status: 400 });
  }

  const { error } = await db
    .from('web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('portal_user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
