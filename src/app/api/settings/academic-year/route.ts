import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentAcademicYear, liveAcademicSession } from '@/lib/reports/academic-period';

export const dynamic = 'force-dynamic';

function defaultAcademicYear(): string {
  return getCurrentAcademicYear();
}

const TERM_LABELS: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

function normalizeTermCalendar(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    term1: { start: raw.term1?.start || '', end: raw.term1?.end || '' },
    term2: { start: raw.term2?.start || '', end: raw.term2?.end || '' },
    term3: { start: raw.term3?.start || '', end: raw.term3?.end || '' },
  };
}

async function upsertCanonicalTerms(admin: any, academicYear: string, termCalendar?: Record<string, any> | null) {
  const rows = [1, 2, 3].map((termNumber) => {
    const key = `term${termNumber}`;
    const dates = termCalendar?.[key] ?? {};
    return {
      academic_year: academicYear,
      term_number: termNumber,
      term_label: TERM_LABELS[termNumber],
      start_date: dates.start || null,
      end_date: dates.end || null,
      updated_at: new Date().toISOString(),
    };
  });
  await admin.from('academic_terms').upsert(rows, { onConflict: 'academic_year,term_number' });
}

// GET /api/settings/academic-year?school_id=uuid (optional)
// Returns { platform, school, effective, term_calendar, terms, current_term }
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const url = new URL(req.url);
  const schoolId = url.searchParams.get('school_id');

  // Platform default academic year
  const { data: platformRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'academic_year')
    .maybeSingle();
  const platform = platformRow?.value ?? defaultAcademicYear();

  // School override academic year
  let school: string | null = null;
  if (schoolId) {
    const { data: schoolRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', `academic_year_school_${schoolId}`)
      .maybeSingle();
    school = schoolRow?.value ?? null;
  }

  // Term calendar — school override first, then platform default
  let termCalendar: Record<string, unknown> | null = null;
  if (schoolId) {
    const { data: tcRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', `term_calendar_school_${schoolId}`)
      .maybeSingle();
    if (tcRow?.value && typeof tcRow.value === 'object') termCalendar = tcRow.value;
  }
  if (!termCalendar) {
    const { data: tcPlatRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'term_calendar')
      .maybeSingle();
    if (tcPlatRow?.value && typeof tcPlatRow.value === 'object') termCalendar = tcPlatRow.value;
  }

  const effective = school ?? platform;
  const { data: terms } = await admin
    .from('academic_terms')
    .select('id, academic_year, term_number, term_label, start_date, end_date, is_current')
    .order('academic_year', { ascending: false })
    .order('term_number', { ascending: false });
  const currentTerm =
    (terms ?? []).find(
      (term: any) =>
        term.academic_year === liveAcademicSession().periodLabel
        && term.term_label === liveAcademicSession().termLabel,
    )
    ?? (terms ?? []).find((term: any) => term.is_current)
    ?? null;

  return NextResponse.json({
    platform,
    school,
    effective,
    term_calendar: termCalendar,
    terms: terms ?? [],
    current_term: currentTerm,
  });
}

// PATCH /api/settings/academic-year
// Body: { year?: "2025/2026", term_calendar?: {...}, school_id?: "uuid", current_term_id?: "uuid" }
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
  const { year, school_id, term_calendar, current_term_id } = body;

  const isSchoolLevel = !!school_id;

  // Auth check for school-level writes
  if (isSchoolLevel && profile.role === 'teacher') {
    const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
    const sids = await getTeacherSchoolIds(user.id, profile.school_id);
    if (!sids.includes(school_id)) {
      return NextResponse.json({ error: 'You can only set settings for your own schools' }, { status: 403 });
    }
  } else if (isSchoolLevel && profile.role === 'school' && profile.school_id !== school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } else if (!isSchoolLevel && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can set platform-wide settings' }, { status: 403 });
  }

  const ops: Promise<unknown>[] = [];

  // Save academic year
  if (year) {
    if (!/^\d{4}\/\d{4}$/.test(year)) {
      return NextResponse.json({ error: 'year must be in format YYYY/YYYY' }, { status: 400 });
    }
    const yearKey = isSchoolLevel ? `academic_year_school_${school_id}` : 'academic_year';
    ops.push(admin.from('app_settings').upsert({ key: yearKey, value: year, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
  }

  // Save term calendar
  if (term_calendar && typeof term_calendar === 'object') {
    const normalized = normalizeTermCalendar(term_calendar);
    const tcKey = isSchoolLevel ? `term_calendar_school_${school_id}` : 'term_calendar';
    ops.push(admin.from('app_settings').upsert({ key: tcKey, value: normalized, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
    if (year) {
      ops.push(upsertCanonicalTerms(admin, year, normalized));
    }
  } else if (year) {
    ops.push(upsertCanonicalTerms(admin, year, null));
  }

  if (current_term_id) {
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can set the platform current term' }, { status: 403 });
    }
    const { data: term } = await admin
      .from('academic_terms')
      .select('id, academic_year')
      .eq('id', current_term_id)
      .maybeSingle();
    if (!term) return NextResponse.json({ error: 'Selected academic term was not found' }, { status: 404 });
    ops.push(admin.from('academic_terms').update({ is_current: false, updated_at: new Date().toISOString() }).neq('id', current_term_id));
    ops.push(admin.from('academic_terms').update({ is_current: true, updated_at: new Date().toISOString() }).eq('id', current_term_id));
    const yearKey = isSchoolLevel ? `academic_year_school_${school_id}` : 'academic_year';
    ops.push(admin.from('app_settings').upsert({ key: yearKey, value: term.academic_year, updated_at: new Date().toISOString() }, { onConflict: 'key' }));
  }

  if (ops.length === 0) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });

  const results = await Promise.all(ops);
  const err = results.find((r: any) => r.error);
  if (err) return NextResponse.json({ error: (err as any).error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
