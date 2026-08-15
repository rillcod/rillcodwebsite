/**
 * GET /api/c/[token] — one piece of gallery media, for somebody with no account.
 *
 * This is what a QR code on a printed school report resolves to. A proprietor or
 * board member holding that page has no login and never will, so the address has
 * to work on its own — and what makes that safe is the token, exactly as the
 * partnership documents do it. Never the row id, which is a uuid but is also
 * handed out in authenticated responses.
 *
 * The media URL is signed here and expires. Nothing durable leaks: forward the
 * page and the recipient gets the same short-lived signature, not the bucket.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { isValidShareToken } from '@/lib/partnerships/signing';
import { withSignedUrl } from '@/lib/schools/gallery-media';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const value = String(token || '').trim();

  // A malformed token and a wrong one answer identically: this endpoint never
  // confirms that a clip exists to somebody who was not sent the link.
  if (!isValidShareToken(value)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const ip = await getClientIp(req as any);
  try {
    await checkCustomRateLimit({ key: `capstone-view:${ip}`, max: 60, window: 900 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }
    throw err;
  }

  const db = createAdminClient();
  const { data: media, error } = await db
    .from('school_gallery_media')
    .select('id, school_id, title, category, media_type, is_capstone_demo, created_at, url, thumbnail_url, r2_key')
    .eq('share_token', value)
    .maybeSingle();

  if (error || !media) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', media.school_id)
    .maybeSingle();

  const signed = await withSignedUrl(media as any);

  return NextResponse.json({
    title: signed.title,
    category: signed.category,
    mediaType: signed.media_type,
    isCapstone: signed.is_capstone_demo,
    createdAt: signed.created_at,
    url: signed.url,
    // The school is named because the page is about its students' work. Nothing
    // else about the school is returned — this is a public address.
    schoolName: school?.name ?? null,
  });
}
