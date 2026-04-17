import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system/status — public, no auth required (Req 11.1)
 * Returns { maintenance_mode: boolean, minimum_web_version: string }
 * read from system_settings.
 */
export async function GET() {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from('system_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['maintenance_mode', 'minimum_web_version']);

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.setting_key] = String(row.setting_value ?? '');
    }

    return NextResponse.json({
      maintenance_mode: map['maintenance_mode'] === 'true',
      minimum_web_version: map['minimum_web_version'] ?? '0.0.0',
    });
  } catch {
    // Never let this endpoint error — return safe defaults
    return NextResponse.json({ maintenance_mode: false, minimum_web_version: '0.0.0' });
  }
}
