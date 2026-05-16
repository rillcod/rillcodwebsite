import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function defaultAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 8 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

// GET /api/settings/academic-year?school_id=uuid (optional)
// Returns { platform: "2025/2026", school: "2025/2026" | null, effective: "2025/2026" }
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const url = new URL(req.url);
  const schoolId = url.searchParams.get('school_id');

  // Platform default
  const { data: platformRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'academic_year')
    .maybeSingle();
  const platform = platformRow?.value ?? defaultAcademicYear();

  // School override
  let school: string | null = null;
  if (schoolId) {
    const { data: schoolRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', `academic_year_school_${schoolId}`)
      .maybeSingle();
    school = schoolRow?.value ?? null;
  }

  const effective = school ?? platform;
  return NextResponse.json({ platform, school, effective });
}

// PATCH /api/settings/academic-year
// Body: { year: "2025/2026", school_id?: "uuid" }
// school_id = null or omitted → update platform default (admin only)
// school_id = uuid → update school override (admin or teacher of that school)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { year, school_id } = body;

  // Validate format: YYYY/YYYY
  if (!year || !/^\d{4}\/\d{4}$/.test(year)) {
    return NextResponse.json({ error: 'year must be in format YYYY/YYYY, e.g. 2025/2026' }, { status: 400 });
  }

  const isSchoolLevel = !!school_id;

  if (!isSchoolLevel && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can set the platform academic year' }, { status: 403 });
  }

  if (isSchoolLevel) {
    // Teachers can only set for their own assigned schools
    if (profile.role === 'teacher') {
      const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
      const sids = await getTeacherSchoolIds(user.id, profile.school_id);
      if (!sids.includes(school_id)) {
        return NextResponse.json({ error: 'You can only set the academic year for your own schools' }, { status: 403 });
      }
    } else if (profile.role === 'school' && profile.school_id !== school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const settingKey = isSchoolLevel ? `academic_year_school_${school_id}` : 'academic_year';

  const { error } = await admin
    .from('app_settings')
    .upsert({ key: settingKey, value: year, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, key: settingKey, value: year });
}
