import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCaller() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await adminClient()
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!data || !['admin', 'teacher', 'school'].includes(data.role)) return null;
  return data;
}

export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = adminClient();
  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: abuse24h }, { count: reportsOpen }, { count: escalationsOpen }, { data: topReasons }] = await Promise.all([
    admin.from('communication_abuse_events').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo),
    admin.from('communication_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('communication_escalations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin
      .from('communication_abuse_events')
      .select('event_type, reason, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const reasonCounts = new Map<string, number>();
  for (const row of topReasons ?? []) {
    const key = `${String((row as any).event_type)}: ${String((row as any).reason)}`;
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const top = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return NextResponse.json({
    data: {
      abuse_events_24h: abuse24h ?? 0,
      open_reports: reportsOpen ?? 0,
      open_escalations: escalationsOpen ?? 0,
      top_abuse_reasons_7d: top,
    },
  });
}
