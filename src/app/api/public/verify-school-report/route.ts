import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase() || '';
  if (!/^SR-[A-F0-9]{20}$/.test(code)) return NextResponse.json({ found: false }, { status: 404 });
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('school_performance_reports')
    .select('title,term_label,academic_year,published_at,published_revision_number,verification_code,schools(name)')
    .eq('verification_code', code)
    .eq('status', 'published')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ found: false }, { status: 404 });
  return NextResponse.json({ found: true, report: {
    title: data.title,
    school: (data.schools as any)?.name || 'Partner school',
    termLabel: data.term_label,
    academicYear: data.academic_year,
    publishedAt: data.published_at,
    revision: data.published_revision_number,
    code: data.verification_code,
  } });
}
