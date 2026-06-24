import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { r2SignedUrl } from '@/lib/r2/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/slides/<r2-key>
 *
 * View-only slide image proxy for the in-platform SlideViewer. Unlike /api/media
 * (which 302-redirects to a downloadable signed R2 URL), this **streams the bytes**
 * through our domain so the client never receives a grabbable file URL, and we send
 * no-store + inline headers (no download). This is deterrence, not DRM — it stops
 * casual download/right-click-save, but cannot prevent OS screenshots. The
 * SlideViewer's per-student watermark makes any leak traceable.
 */
async function resolveUser(req: NextRequest) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: { get: () => undefined, set: () => {}, remove: () => {} },
    });
    const { data } = await sb.auth.getUser(token);
    if (data.user) return data.user;
  }

  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
      set: () => {},
      remove: () => {},
    },
  });
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key } = await context.params;
  const r2Key = key.join('/');
  if (r2Key.includes('..') || r2Key.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let signedUrl: string;
  try {
    signedUrl = await r2SignedUrl(r2Key, 300);
  } catch {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  }

  // Fetch from R2 server-side and re-stream the bytes — the signed URL is never
  // exposed to the browser.
  const upstream = await fetch(signedUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
