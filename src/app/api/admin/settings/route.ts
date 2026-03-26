import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Must be admin to access settings? Or at least teacher?
    // Let's just pull it
    const db = createAdminClient();
    const { data: setting, error } = await db
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'card_builder_config')
      .maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    if (!setting || !setting.setting_value) {
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({ config: JSON.parse(setting.setting_value) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { config } = body;

    const db = createAdminClient();
    
    // Check if it exists
    const { data: existing } = await db
      .from('system_settings')
      .select('id')
      .eq('setting_key', 'card_builder_config')
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
          description: 'Global configuration for the student card builder',
          setting_key: 'card_builder_config',
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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
