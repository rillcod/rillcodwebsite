import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import {
  accessCardCodeForStudent,
  accessCardCodeMatchesStudent,
  isStudentPortalUuid,
  normalizeAccessCardCode,
} from '@/lib/access-card-code';
import { isParentCaptured } from '@/lib/parent-claim/captured';
import { resolveStaffResultBypass } from '@/lib/parent-claim/staff-bypass';
import { toPublicStudentIdentity } from '@/lib/public/student-identity';

function normalizeCardCode(raw: string) {
  return decodeURIComponent(raw || '')
    .trim()
    .replace(/^RC-/i, '')
    .toLowerCase();
}

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
  const decodedId = decodeURIComponent(id || '').trim();
  const portalUuid = isStudentPortalUuid(decodedId);
  const code = portalUuid ?? normalizeCardCode(id);
  const accessCodeParam = new URL(req.url).searchParams.get('accessCode');

  if (!code || code.length < 8) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const db = createAdminClient();

  const cardStudentId = portalUuid ?? (await resolveByCardCode(db, id));

  const portalQuery = db
    .from('portal_users')
    .select('id, full_name, school_name, school_id, is_active, enrollment_type, avatar_url, section_class, class_id, created_at')
    .eq('role', 'student')
    .neq('is_deleted', true)
    .limit(2);
  const { data: portalData } = cardStudentId
    ? await portalQuery.eq('id', cardStudentId)
    : await portalQuery.ilike('id', `${code}%`);

  if (portalData && portalData.length === 1) {
    const portalStudent = portalData[0];
    let className: string | null = portalStudent.section_class;
    if (portalStudent.class_id && !className) {
      const { data: classData } = await db
        .from('classes')
        .select('name')
        .eq('id', portalStudent.class_id)
        .maybeSingle();
      className = classData?.name ?? null;
    }

    const expectedCode = accessCardCodeForStudent(portalStudent.id);
    const providedCode = normalizeAccessCardCode(accessCodeParam ?? id);
    let codeAuthorized = !!providedCode && accessCardCodeMatchesStudent(providedCode, portalStudent.id);
    if (!codeAuthorized && providedCode === expectedCode) codeAuthorized = true;
    if (!codeAuthorized) {
      const rawUuid = isStudentPortalUuid(accessCodeParam ?? id);
      if (rawUuid && rawUuid === String(portalStudent.id).toLowerCase()) codeAuthorized = true;
    }

    const staffBypass = await resolveStaffResultBypass(db, portalStudent.school_id);
    const parentCaptured = await isParentCaptured(db, portalStudent.id);
    // Staff may resolve identity for attendance/QR. Public visitors need a valid card
    // code AND a linked parent — same rule as the result-check reports route.
    const revealIdentity = staffBypass.bypass || (codeAuthorized && parentCaptured);

    if (!revealIdentity) {
      const redacted = toPublicStudentIdentity({
        id: portalStudent.id,
        full_name: portalStudent.full_name,
        school_name: portalStudent.school_name,
        is_active: portalStudent.is_active,
        enrollment_type: portalStudent.enrollment_type,
        avatar_url: portalStudent.avatar_url ?? null,
        class_name: className,
        school_logo: null,
        enrolled_at: portalStudent.created_at,
        source: 'portal',
      }, false);
      return NextResponse.json(
        {
          accessRequired: true,
          needsParentSetup: codeAuthorized && !parentCaptured && !staffBypass.bypass,
          codeAccepted: codeAuthorized,
          parentCaptured,
          staffBypass: staffBypass.bypass,
          redirect: `/result-check/${encodeURIComponent(normalizeAccessCardCode(id) || id)}`,
          error: codeAuthorized
            ? 'Parent setup is required before this student identity is shown.'
            : 'Result access code required',
          ...redacted,
          student: redacted,
        },
        { status: codeAuthorized ? 403 : 401 },
      );
    }

    const payload = toPublicStudentIdentity({
      id: portalStudent.id,
      full_name: portalStudent.full_name,
      school_name: portalStudent.school_name,
      is_active: portalStudent.is_active,
      enrollment_type: portalStudent.enrollment_type,
      avatar_url: portalStudent.avatar_url ?? null,
      class_name: className,
      school_logo: null,
      enrolled_at: portalStudent.created_at,
      source: 'portal',
    }, true);

    return NextResponse.json({
      accessRequired: false,
      needsParentSetup: false,
      parentCaptured,
      staffBypass: staffBypass.bypass,
      staffRole: staffBypass.actorRole ?? null,
      ...payload,
      student: payload,
    });
  }

  // Fallback: pre-portal students table — staff only (no public identity leak).
  const { data: studentData } = await db
    .from('students')
    .select('id, full_name, school_name, school_id, status, grade_level, created_at')
    .ilike('id', `${code}%`)
    .limit(2);

  if (studentData && studentData.length === 1) {
    const rawStudent = studentData[0];
    const staffBypass = await resolveStaffResultBypass(db, rawStudent.school_id);
    if (!staffBypass.bypass) {
      return NextResponse.json(
        { accessRequired: true, error: 'Result access code required', redirect: `/result-check/${encodeURIComponent(id)}` },
        { status: 401 },
      );
    }
    const payload = toPublicStudentIdentity({
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
    }, true);
    return NextResponse.json({
      accessRequired: false,
      staffBypass: true,
      staffRole: staffBypass.actorRole ?? null,
      ...payload,
      student: payload,
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
