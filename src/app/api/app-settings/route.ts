import { NextRequest, NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit/log';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  PLATFORM_CONFIGURATION_KEYS,
  PLATFORM_CONFIGURATION_SECTION_KEYS,
  PLATFORM_SETTING_DEFINITIONS,
  isAllowedAppSettingMutationKey,
  isPlatformConfigurationKey,
  isRuntimeEnvPlatformSecret,
  isSensitivePlatformSetting,
  normalizePlatformSetting,
  runtimeEnvSecretIsConfigured,
  type PlatformConfigurationSection,
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
    .select('id, role, is_active, is_deleted')
    .eq('id', user.id)
    .single();
  if (
    !profile ||
    profile.role !== 'admin' ||
    profile.is_active !== true ||
    profile.is_deleted
  ) {
    return null;
  }
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

  // Secrets are write-only and, for provider keys, not stored here at all.
  // Runtime AI reads process.env / Cloudflare. A browser only learns whether
  // the server actually has a key — never a value from app_settings.
  const rows = new Map((data ?? []).map((row: any) => [row.key, row]));
  const masked = PLATFORM_CONFIGURATION_KEYS.map((key) => {
    const row = rows.get(key) as any;
    const sensitive = isSensitivePlatformSetting(key);
    const envOwned = isRuntimeEnvPlatformSecret(key);
    return {
      key,
      value: sensitive ? '' : (row?.value ?? PLATFORM_SETTING_DEFINITIONS[key].defaultValue),
      sensitive,
      configured: sensitive
        ? (envOwned ? runtimeEnvSecretIsConfigured(key) : Boolean(String(row?.value ?? '').trim()))
        : undefined,
      source: envOwned ? 'env' : 'database',
      updated_at: row?.updated_at ?? null,
      section: PLATFORM_SETTING_DEFINITIONS[key].section,
    };
  });

  return NextResponse.json({ data: masked });
}

// PUT /api/app-settings — admin upserts one or more settings
// Body: { section?: 'ai' | 'experience'; settings: { key; value; expected_updated_at? }[] }
export async function PUT(request: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  const settings: { key: string; value: string; expected_updated_at?: string | null }[] = body.settings ?? [];

  if (!Array.isArray(settings) || settings.length === 0) {
    return NextResponse.json({ error: 'settings array required' }, { status: 400 });
  }

  const envSecret = settings.find((setting) => isRuntimeEnvPlatformSecret(String(setting?.key ?? '')));
  if (envSecret) {
    return NextResponse.json(
      {
        error:
          'OpenRouter and Gemini keys are set in the server environment, not in this form. Saving here does not change what the models use.',
      },
      { status: 400 },
    );
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

  if (new Set(settings.map((setting) => setting.key)).size !== settings.length) {
    return NextResponse.json({ error: 'Each setting may appear only once' }, { status: 400 });
  }

  const platformSettings = settings.filter((setting) => isPlatformConfigurationKey(setting.key));
  const workflowSettings = settings.filter((setting) => !isPlatformConfigurationKey(setting.key));
  if (platformSettings.length && workflowSettings.length) {
    return NextResponse.json({ error: 'Save platform and workflow settings separately' }, { status: 400 });
  }

  let normalizedSettings = settings;
  if (platformSettings.length) {
    const section = String(body.section || '') as PlatformConfigurationSection;
    if (!Object.prototype.hasOwnProperty.call(PLATFORM_CONFIGURATION_SECTION_KEYS, section)) {
      return NextResponse.json({ error: 'A valid configuration section is required' }, { status: 400 });
    }
    const ownedKeys = new Set<string>(PLATFORM_CONFIGURATION_SECTION_KEYS[section]);
    const wrongOwner = platformSettings.find((setting) => !ownedKeys.has(setting.key));
    if (wrongOwner) {
      return NextResponse.json({ error: `${wrongOwner.key} belongs to another configuration section` }, { status: 400 });
    }
    const normalized: typeof settings = [];
    for (const setting of platformSettings) {
      const result = normalizePlatformSetting(setting.key as any, setting.value);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      normalized.push({ ...setting, value: result.value });
    }
    normalizedSettings = normalized;
  }

  for (const s of normalizedSettings) {
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

  let versions: Record<string, string> = {};
  if (platformSettings.length) {
    const { data, error } = await (adminClient() as any).rpc('update_platform_configuration', {
      p_actor_id: caller.id,
      p_changes: normalizedSettings.map((setting) => ({
        key: setting.key,
        value: setting.value,
        expected_updated_at: setting.expected_updated_at ?? null,
      })),
    });
    if (error) {
      const conflict = error.code === '40001' || /changed in another session/i.test(error.message || '');
      return NextResponse.json(
        { error: conflict ? 'These settings changed in another session. Reload to review the latest values before saving.' : error.message },
        { status: conflict ? 409 : 500 },
      );
    }
    versions = Object.fromEntries((data ?? []).map((row: any) => [row.setting_key, row.updated_at]));
  } else {
    const rows = normalizedSettings.map(s => ({
      key: s.key,
      value: s.value ?? '',
      updated_at: new Date().toISOString(),
    }));
    const { data, error } = await adminClient()
      .from('app_settings')
      .upsert(rows, { onConflict: 'key' })
      .select('key,updated_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    versions = Object.fromEntries((data ?? []).map((row: any) => [row.key, row.updated_at]));
  }

  // Audit platform-policy changes — who changed which settings to what.
  const safeAuditSettings = normalizedSettings.map((setting) => ({
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

  return NextResponse.json({ success: true, versions });
}
