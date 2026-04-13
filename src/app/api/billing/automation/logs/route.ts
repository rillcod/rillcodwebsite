import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const db = createAdminClient();
  const { data: logs } = await (db as any)
    .from('invoice_automation_logs')
    .select('id, triggered_by, invoices_scanned, reminders_sent, overdue_marked, errors, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ logs: logs ?? [] });
}
