import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
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

  // ── Enrollment lock ──────────────────────────────────────────────────────
  // When the viewer passes ?lesson=<id>, enforce that (1) this key is actually a
  // slide of that lesson's deck, and (2) the caller is staff OR enrolled in the
  // lesson's programme. Keys are random UUIDs, but this stops a logged-in user who
  // isn't enrolled from streaming a deck they shouldn't see.
  const lessonId = req.nextUrl.searchParams.get('lesson');
  if (lessonId) {
    const db = createAdminClient();

    // (1) key must belong to this lesson's slide decks
    const { data: decks } = await db
      .from('lesson_materials')
      .select('file_url')
      .eq('lesson_id', lessonId)
      .eq('file_type', 'slide-deck');
    const allowedKeys = new Set<string>();
    for (const d of decks ?? []) {
      try {
        const parsed = JSON.parse((d as any).file_url);
        // image decks store keys in `slides`; PDF decks store one key in `pdf`
        if (Array.isArray(parsed?.slides)) for (const k of parsed.slides) if (typeof k === 'string') allowedKeys.add(k);
        if (typeof parsed?.pdf === 'string') allowedKeys.add(parsed.pdf);
      } catch { /* ignore malformed */ }
    }
    if (!allowedKeys.has(r2Key)) {
      return NextResponse.json({ error: 'Slide is not part of this lesson' }, { status: 403 });
    }

    // (2) staff bypass; everyone else must be enrolled in the lesson's programme
    const { data: prof } = await db.from('portal_users').select('role').eq('id', user.id).maybeSingle();
    const role = (prof as any)?.role ?? '';
    const isStaff = ['admin', 'teacher', 'school'].includes(role);
    if (!isStaff) {
      const { data: lesson } = await db.from('lessons').select('course_id').eq('id', lessonId).maybeSingle();
      const courseId = (lesson as any)?.course_id ?? null;
      const { data: course } = courseId
        ? await db.from('courses').select('program_id').eq('id', courseId).maybeSingle()
        : { data: null as any };
      const programId = (course as any)?.program_id ?? null;
      if (!programId) return NextResponse.json({ error: 'Lesson is not attached to a programme' }, { status: 403 });
      const { data: enr } = await db
        .from('enrollments')
        .select('id')
        .eq('user_id', user.id)
        .eq('program_id', programId)
        .maybeSingle();
      if (!enr) return NextResponse.json({ error: 'You are not enrolled in this programme' }, { status: 403 });
    }
  }

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
