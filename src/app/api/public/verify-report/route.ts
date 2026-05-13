import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Public endpoint — no auth required. Uses service role to bypass RLS.
// Only returns published reports so drafts stay private.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const admin = createAdminClient();

  // Match by UUID prefix (case-insensitive) — QR codes embed first 8 chars or full UUID
  const { data: report, error } = await (admin as any)
    .from('student_progress_reports')
    .select('*')
    .ilike('id', `${code.toLowerCase()}%`)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ found: false, reason: 'notfound' }, { status: 404 });
  if (!report.is_published) return NextResponse.json({ found: false, reason: 'unpublished' }, { status: 403 });

  // Fetch org branding for the verify page to render the report card
  const { data: orgData } = await (admin as any)
    .from('report_settings')
    .select('*')
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ found: true, report, orgSettings: orgData ?? null });
}
