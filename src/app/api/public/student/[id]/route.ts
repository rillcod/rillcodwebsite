import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { normalizeAccessCardCode, accessCardCodeMatchesStudent } from '@/lib/access-card-code';

function normalizeCardCode(raw: string) {
  return decodeURIComponent(raw || '')
    .trim()
    .replace(/^RC-/i, '')
    .toLowerCase();
}

// The canonical card code (RC-XXXXXXXX) is a HASH of the student's UUID, not its prefix —
// so resolve it by hashing each student and matching, using the result_access_codes cache
// first. Returns the student's portal_users.id or null.
async function resolveByCardCode(db: ReturnType<typeof createAdminClient>, rawId: string): Promise<string | null> {
  const rc = normalizeAccessCardCode(rawId);
  if (!rc) return null;
  const { data: cached } = await db
    .from('result_access_codes').select('student_id').eq('access_code', rc).maybeSingle();
  if (cached?.student_id) return cached.student_id as string;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('portal_users').select('id').eq('role', 'student').neq('is_deleted', true).range(from, from + 999);
    if (error || !data || data.length === 0) break;
    const hit = data.find((s: { id: string }) => accessCardCodeMatchesStudent(rc, s.id));
    if (hit) return hit.id;
    if (data.length < 1000) break;
  }
  return null;
}

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
  const code = normalizeCardCode(id);

  if (!code || code.length < 8) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = createAdminClient();

  // 0. Canonical card code (RC-XXXXXXXX) → resolve by hash. Then fall back to the legacy
  //    UUID-prefix match (old QR encoded the raw UUID) so both card generations still scan.
  const cardStudentId = await resolveByCardCode(db, id);

  // 1. Try portal_users (enrolled / registered students)
  const portalQuery = db
    .from('portal_users')
    .select('id, full_name, school_name, is_active, enrollment_type, avatar_url, section_class, class_id, created_at')
    .eq('role', 'student')
    .limit(2);
  const { data: portalData } = cardStudentId
    ? await portalQuery.eq('id', cardStudentId)
    : await portalQuery.ilike('id', `${code}%`);

  if (portalData && portalData.length === 1) {
    const portalStudent = portalData[0];
    // Get class info if class_id exists
    let className: string | null = portalStudent.section_class;
    if (portalStudent.class_id && !className) {
      const { data: classData } = await db
        .from('classes')
        .select('name')
        .eq('id', portalStudent.class_id)
        .maybeSingle();
      className = classData?.name ?? null;
    }

    const schoolLogo: string | null = null;

    return NextResponse.json({
      id: portalStudent.id,
      full_name: portalStudent.full_name,
      school_name: portalStudent.school_name,
      is_active: portalStudent.is_active,
      enrollment_type: portalStudent.enrollment_type,
      avatar_url: portalStudent.avatar_url ?? null,
      class_name: className,
      school_logo: schoolLogo,
      enrolled_at: portalStudent.created_at,
      source: 'portal',
    });
  }

  // 2. Fallback: pre-portal students table
  const { data: studentData } = await db
    .from('students')
    .select('id, full_name, school_name, status, grade_level, created_at')
    .ilike('id', `${code}%`)
    .limit(2);

  if (studentData && studentData.length === 1) {
    const rawStudent = studentData[0];
    return NextResponse.json({
      id: rawStudent.id,
      full_name: rawStudent.full_name,
      school_name: rawStudent.school_name,
      is_active: rawStudent.status === 'active',
      enrollment_type: null,
      avatar_url: null,
      class_name: rawStudent.grade_level,
      school_logo: null,
      enrolled_at: rawStudent.created_at,
      source: 'students',
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
