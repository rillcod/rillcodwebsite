import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CARD_CONFIG_KEYS = {
  student: 'card_builder_config_student',
  parent: 'card_builder_config_parent',
  teacher: 'card_builder_config_teacher',
  legacy: 'card_builder_config',
} as const;

export async function GET(_request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(_request.url);
    const type = (url.searchParams.get('type') || 'student').toLowerCase() as 'student' | 'parent' | 'teacher';
    const key = CARD_CONFIG_KEYS[type] || CARD_CONFIG_KEYS.student;

    const db = createAdminClient();
    const initial = await db
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', key)
      .maybeSingle();
    let setting = initial.data;
    const { error } = initial;

    if (error) {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    // Backward compatibility: if per-type key is missing, fallback to legacy value
    if (!setting?.setting_value) {
      const { data: legacy } = await db
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', CARD_CONFIG_KEYS.legacy)
        .maybeSingle();
      setting = legacy as any;
    }

    if (!setting?.setting_value) {
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({ config: JSON.parse(setting.setting_value) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = createAdminClient();
    const { data: caller } = await db
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { config } = body || {};
    const type = (body?.type || 'student').toLowerCase() as 'student' | 'parent' | 'teacher';
    const key = CARD_CONFIG_KEYS[type] || CARD_CONFIG_KEYS.student;

    // Check if it exists
    const { data: existing } = await db
      .from('system_settings')
      .select('id')
      .eq('setting_key', key)
      .maybeSingle();

    let saveErr;

    if (existing) {
      const { error } = await db
        .from('system_settings')
        .update({ setting_value: JSON.stringify(config), updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      saveErr = error;
    } else {
      const { error } = await db
        .from('system_settings')
        .insert({
          category: 'admin',
          description: `Global configuration for ${type} card builder`,
          setting_key: key,
          setting_value: JSON.stringify(config),
          is_public: false,
        });
      saveErr = error;
    }

    if (saveErr) {
      console.error('Error saving settings:', saveErr);
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Saved successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
