import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_CONFIG, type BillingAutomationConfig } from './config';

const SETTING_KEY = 'billing_automation_config';

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
  const { data } = await db
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  let config = DEFAULT_CONFIG;
  if (data?.setting_value) {
    try { config = { ...DEFAULT_CONFIG, ...JSON.parse(data.setting_value) }; } catch { /* use defaults */ }
  }

  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const config: BillingAutomationConfig = {
    invoice_reminders_enabled:   !!body.invoice_reminders_enabled,
    reminder_1_days_after_issue: Math.max(0, Number(body.reminder_1_days_after_issue ?? 1)),
    reminder_2_days_before_due:  Math.max(0, Number(body.reminder_2_days_before_due  ?? 3)),
    reminder_3_days_after_due:   Math.max(0, Number(body.reminder_3_days_after_due   ?? 1)),
    auto_overdue_enabled:        !!body.auto_overdue_enabled,
    notify_email:                !!body.notify_email,
    notify_in_app:               !!body.notify_in_app,
  };

  const db = createAdminClient();
  const { data: existing } = await db
    .from('system_settings')
    .select('id')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  if (existing) {
    await db.from('system_settings').update({
      setting_value: JSON.stringify(config),
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await db.from('system_settings').insert({
      setting_key: SETTING_KEY,
      setting_value: JSON.stringify(config),
      category: 'billing',
      description: 'Automated billing reminder rules and schedule',
      is_public: false,
    });
  }

  return NextResponse.json({ success: true, config });
}
