import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/push';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Attempt to send a push notification to the current user
    const result = await sendPushNotification(user.id, {
      title: 'It works! 🎉',
      body: 'Your Web Push Notifications are working perfectly on the Rillcod Academy!',
      url: '/dashboard'
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Push notification triggered.',
      debug: result
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}
