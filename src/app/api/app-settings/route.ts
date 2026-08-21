import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  PLATFORM_CONFIGURATION_KEYS,
  isAllowedAppSettingMutationKey,
  isSensitivePlatformSetting,
} from '@/lib/config/platform-settings';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return profile;
}

// GET /api/app-settings — only the keys owned by Platform Configuration.
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data, error } = await adminClient()
    .from('app_settings')
    .select('key, value, updated_at')
    .in('key', [...PLATFORM_CONFIGURATION_KEYS])
    .order('key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Secrets are write-only. A browser only learns whether one is configured.
  const masked = (data ?? []).map((row: any) => ({
    key: row.key,
    value: isSensitivePlatformSetting(row.key) ? '' : row.value,
    sensitive: isSensitivePlatformSetting(row.key),
    configured: isSensitivePlatformSetting(row.key)
      ? Boolean(String(row.value ?? '').trim())
      : undefined,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ data: masked });
}

// PUT /api/app-settings — admin upserts one or more settings
// Body: { settings: { key: string; value: string }[] }
export async function PUT(request: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  const settings: { key: string; value: string }[] = body.settings ?? [];

  if (!Array.isArray(settings) || settings.length === 0) {
    return NextResponse.json({ error: 'settings array required' }, { status: 400 });
  }

  const unsupported = settings.find(
    (setting) => !isAllowedAppSettingMutationKey(String(setting?.key ?? ''))
  );
  if (unsupported) {
    return NextResponse.json(
      { error: `Setting is owned by another workflow: ${unsupported.key}` },
      { status: 400 },
    );
  }

  for (const s of settings) {
    if (s.key === 'default_registration_program_id') {
      const v = (s.value ?? '').trim();
      if (!v) continue;
      const uuidOk =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      if (!uuidOk) {
        return NextResponse.json(
          { error: 'default_registration_program_id must be a valid UUID or empty' },
          { status: 400 },
        );
      }
      const { data: prog, error: pe } = await adminClient()
        .from('programs')
        .select('id, price')
        .eq('id', v)
        .maybeSingle();
      if (pe || !prog) {
        return NextResponse.json({ error: 'default_registration_program_id: programme not found' }, { status: 400 });
      }
      if (prog.price == null || Number(prog.price) <= 0) {
        return NextResponse.json(
          { error: 'default_registration_program_id: programme must have price > 0' },
          { status: 400 },
        );
      }
    }
  }

  const rows = settings.map(s => ({
    key: s.key,
    value: s.value ?? '',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await adminClient()
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit platform-policy changes — who changed which settings to what.
  const safeAuditSettings = settings.map((setting) => ({
    key: setting.key,
    value: isSensitivePlatformSetting(setting.key)
      ? '[secret updated]'
      : setting.value,
  }));
  await logAudit(adminClient() as any, {
    action: 'update_platform_settings',
    actorId: (caller as any)?.id ?? null,
    resourceType: 'app_settings',
    newValue: `Updated platform configuration: ${safeAuditSettings
      .map(
        (setting) =>
          `${setting.key.replace(/_/g, ' ')} (${setting.value})`
      )
      .join(', ')}`.slice(0, 500),
    newValues: Object.fromEntries(
      safeAuditSettings.map((setting) => [setting.key, setting.value])
    ),
  });

  return NextResponse.json({ success: true });
}
