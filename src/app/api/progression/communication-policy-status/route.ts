import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getSenderUsageToday, loadCommunicationPolicy } from '@/lib/communication/abusePolicy';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const policy = await loadCommunicationPolicy();
  const usage = await getSenderUsageToday(caller.id);
  const limit = caller.role === 'student'
    ? Number(policy.student_dm_daily_limit)
    : caller.role === 'parent'
      ? Number(policy.parent_dm_daily_limit)
      : 9999;

  return NextResponse.json({
    data: {
      role: caller.role,
      whatsapp_primary_mode: policy.whatsapp_primary_mode,
      allow_inapp_fallback: policy.allow_inapp_fallback,
      cooldown_seconds_between_messages: policy.cooldown_seconds_between_messages,
      daily_limit: limit,
      daily_used: usage.dailyCount,
      daily_remaining: Math.max(0, limit - usage.dailyCount),
      blocked_keywords_enabled: policy.blocked_keywords_enabled,
    },
  });
}
