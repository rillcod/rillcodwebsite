import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { DEFAULT_CONFIG, parseBillingAutomationConfig } from './config';

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
  const { data, error } = await db
    .from('system_settings')
    .select('id, setting_value')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: 'Failed to load billing automation settings', detail: error.message },
      { status: 500 },
    );
  }

  let config;
  if (data?.setting_value) {
    let stored: unknown;
    try {
      stored = JSON.parse(data.setting_value);
    } catch {
      return NextResponse.json(
        { error: 'Billing automation settings are corrupt; repair them before running reminders' },
        { status: 500 },
      );
    }
    const parsed = parseBillingAutomationConfig(stored);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 500 });
    }
    config = parsed.config;
  } else {
    // Persist defaults once so Settings / cron share the same row.
    const { data: inserted, error: insertError } = await db
      .from('system_settings')
      .insert({
        setting_key: SETTING_KEY,
        setting_value: JSON.stringify(DEFAULT_CONFIG),
        category: 'billing',
        description: 'Automated billing reminder rules and schedule',
        is_public: false,
      })
      .select('id')
      .single();
    if (insertError || !inserted) {
      return NextResponse.json(
        { error: 'Failed to initialize billing automation settings', detail: insertError?.message },
        { status: 500 },
      );
    }
    config = DEFAULT_CONFIG;
  }

  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = parseBillingAutomationConfig(body);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
  }
  const config = parsed.config;

  const db = createAdminClient();
  const { data: existing, error: existingError } = await db
    .from('system_settings')
    .select('id, setting_value')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json(
      { success: false, error: 'Failed to inspect billing automation settings', detail: existingError.message },
      { status: 500 },
    );
  }

  let savedId: string | null = null;
  let writeError: { message: string } | null = null;
  if (existing) {
    const { data, error } = await db
      .from('system_settings')
      .update({
        setting_value: JSON.stringify(config),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .maybeSingle();
    writeError = error;
    savedId = data?.id ?? null;
  } else {
    const { data, error } = await db
      .from('system_settings')
      .insert({
        setting_key: SETTING_KEY,
        setting_value: JSON.stringify(config),
        category: 'billing',
        description: 'Automated billing reminder rules and schedule',
        is_public: false,
      })
      .select('id')
      .single();
    writeError = error;
    savedId = data?.id ?? null;
  }
  if (writeError) return NextResponse.json({ success: false, error: 'Failed to save billing automation settings', code: 'db_error', detail: writeError.message }, { status: 500 });
  if (!savedId) {
    return NextResponse.json(
      { success: false, error: 'Billing automation settings were not changed', code: 'no_change' },
      { status: 409 },
    );
  }

  let oldConfig: Record<string, unknown> | null = null;
  if (existing?.setting_value) {
    try {
      const oldParsed = parseBillingAutomationConfig(JSON.parse(existing.setting_value));
      if (oldParsed.ok) oldConfig = oldParsed.config as unknown as Record<string, unknown>;
    } catch {
      oldConfig = { corrupt_setting_replaced: true };
    }
  }
  await logAudit(db as any, {
    action: 'update_billing_automation_settings',
    actorId: caller.id,
    resourceType: 'system_setting',
    resourceId: savedId,
    tableName: 'system_settings',
    oldValues: oldConfig,
    newValues: config as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ success: true, config });
}
