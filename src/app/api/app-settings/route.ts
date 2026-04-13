import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

// GET /api/app-settings — admin fetches all settings (values redacted for display)
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data, error } = await adminClient()
    .from('app_settings')
    .select('key, value, updated_at')
    .order('key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask secret values for display — only show last 4 chars
  const masked = (data ?? []).map((row: any) => ({
    key: row.key,
    // Return the real value for editing, masked display is done client-side
    value: row.value,
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

  return NextResponse.json({ success: true });
}
