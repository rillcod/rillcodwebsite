import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

/**
 * Public certificate verify — service-role lookup by verification code.
 * Certificates RLS no longer allows anon table-wide SELECT.
 */
export async function GET(request: Request) {
  try {
    await checkCustomRateLimit({ key: `public-certificate-verify:${getClientIp(request as any)}`, max: 20, window: 60 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
        { status: 429 },
      );
    }
  }

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase();
  if (!code) return NextResponse.json({ found: false, reason: 'missing_code' }, { status: 400 });
  if (!/^[A-Z0-9_-]{6,80}$/.test(code)) {
    return NextResponse.json({ found: false, reason: 'invalid_code' }, { status: 404 });
  }

  const admin = createAdminClient() as any;
  const { data: certificate, error } = await admin
    .from('certificates')
    .select('id, certificate_number, verification_code, issued_date, pdf_url, portal_users!certificates_portal_user_id_fkey(full_name), courses(title)')
    .eq('verification_code', code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!certificate) return NextResponse.json({ found: false, reason: 'notfound' }, { status: 404 });

  return NextResponse.json({
    found: true,
    certificate: {
      certificate_number: certificate.certificate_number,
      verification_code: certificate.verification_code,
      issued_date: certificate.issued_date,
      pdf_url: certificate.pdf_url ?? null,
      portal_users: certificate.portal_users
        ? { full_name: certificate.portal_users.full_name ?? null }
        : null,
      courses: certificate.courses ? { title: certificate.courses.title ?? null } : null,
    },
  });
}
