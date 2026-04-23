import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type SpineRow = {
  catalog_version: string;
  lane_index: number;
  program_id: string;
  created_at: string;
};

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('platform_syllabus_week_template')
    .select('catalog_version,lane_index,program_id,created_at')
    .order('lane_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as SpineRow[];
  const laneCountsMap = new Map<number, number>();
  const versionCountsMap = new Map<string, number>();
  const programSet = new Set<string>();
  let lastSeedAt = '';

  for (const row of rows) {
    laneCountsMap.set(row.lane_index, (laneCountsMap.get(row.lane_index) ?? 0) + 1);
    versionCountsMap.set(row.catalog_version, (versionCountsMap.get(row.catalog_version) ?? 0) + 1);
    programSet.add(row.program_id);
    if (!lastSeedAt || row.created_at > lastSeedAt) lastSeedAt = row.created_at;
  }

  return NextResponse.json({
    data: {
      total_rows: rows.length,
      active_catalog_version: rows[0]?.catalog_version ?? null,
      program_count: programSet.size,
      last_seed_at: lastSeedAt || null,
      lane_counts: Array.from(laneCountsMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([lane_index, count]) => ({ lane_index, count })),
      versions: Array.from(versionCountsMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([catalog_version, count]) => ({ catalog_version, count })),
    },
  });
}
