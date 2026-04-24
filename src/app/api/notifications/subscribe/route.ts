import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subscription } = await request.json();

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const db = createAdminClient();
    const settingKey = `push_sub_${user.id}`;
    
    // Check if exists
    const { data: existing } = await db
      .from('system_settings')
      .select('id')
      .eq('setting_key', settingKey)
      .maybeSingle();

    if (existing) {
      await db
        .from('system_settings')
        .update({ setting_value: JSON.stringify(subscription), updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await db
        .from('system_settings')
        .insert({
          category: 'push_subscriptions',
          description: `Push subscription for user ${user.id}`,
          setting_key: settingKey,
          setting_value: JSON.stringify(subscription),
          is_public: false,
        });
    }

    return NextResponse.json({ success: true, message: 'Subscribed successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
