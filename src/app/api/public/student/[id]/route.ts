import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Req 7.1 — 10 req / 60 s per client IP
  try {
    await checkCustomRateLimit({ key: getClientIp(req), max: 10, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
        { status: 429 },
      );
    }
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = createAdminClient();

  // 1. Try portal_users (enrolled / registered students)
  const { data: portalData } = await db
    .from('portal_users')
    .select('id, full_name, school_name, is_active, enrollment_type, avatar_url, section_class, class_id, created_at')
    .eq('id', id)
    .eq('role', 'student')
    .maybeSingle();

  if (portalData) {
    // Get class info if class_id exists
    let className: string | null = portalData.section_class;
    if (portalData.class_id && !className) {
      const { data: classData } = await db
        .from('classes')
        .select('name')
        .eq('id', portalData.class_id)
        .maybeSingle();
      className = classData?.name ?? null;
    }

    const schoolLogo: string | null = null;

    return NextResponse.json({
      id: portalData.id,
      full_name: portalData.full_name,
      school_name: portalData.school_name,
      is_active: portalData.is_active,
      enrollment_type: portalData.enrollment_type,
      avatar_url: portalData.avatar_url ?? null,
      class_name: className,
      school_logo: schoolLogo,
      enrolled_at: portalData.created_at,
      source: 'portal',
    });
  }

  // 2. Fallback: pre-portal students table
  const { data: studentData } = await db
    .from('students')
    .select('id, full_name, school_name, status, grade_level, created_at')
    .eq('id', id)
    .maybeSingle();

  if (studentData) {
    return NextResponse.json({
      id: studentData.id,
      full_name: studentData.full_name,
      school_name: studentData.school_name,
      is_active: studentData.status === 'active',
      enrollment_type: null,
      avatar_url: null,
      class_name: studentData.grade_level,
      school_logo: null,
      enrolled_at: studentData.created_at,
      source: 'students',
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
