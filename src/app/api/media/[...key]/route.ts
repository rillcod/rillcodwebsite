import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { r2SignedUrl } from '@/lib/r2/client';

/**
 * Media proxy route — stable URLs for web and mobile apps.
 *
 * View (inline):
 *   GET /api/media/<r2-key>
 *
 * Force download (saves file):
 *   GET /api/media/<r2-key>?download=1
 *   GET /api/media/<r2-key>?download=1&filename=my-notes.pdf
 *
 * Auth:
 *   Authorization: Bearer <supabase_access_token>   ← mobile
 *   (or session cookie)                              ← web
 *
 * Returns a 302 redirect to a short-lived R2 signed URL.
 * Files are served directly from R2 — no Vercel bandwidth used.
 */

async function resolveUser(req: NextRequest) {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // 1. Try Bearer token from Authorization header (mobile / API clients)
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            cookies: { get: () => undefined, set: () => {}, remove: () => {} },
        });
        const { data } = await supabase.auth.getUser(token);
        if (data.user) return data.user;
    }

    // 2. Fall back to cookie-based session (web)
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            get: (name) => cookieStore.get(name)?.value,
            set: () => {},
            remove: () => {},
        },
    });
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
}

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ key: string[] }> }
) {
    const user = await resolveUser(req);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key } = await context.params;
    const r2Key = key.join('/');

    // Basic path validation — prevent directory traversal
    if (r2Key.includes('..') || r2Key.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const { searchParams } = req.nextUrl;
    const isDownload = searchParams.has('download');
    const filename = searchParams.get('filename') ?? r2Key.split('/').pop() ?? 'file';

    let signedUrl: string;
    try {
        signedUrl = await r2SignedUrl(r2Key, 3600, isDownload ? filename : undefined);
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // 302 redirect — R2 serves the file directly, no Vercel bandwidth used.
    // Cache-Control tells mobile clients they can reuse this URL for 55 minutes.
    return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
            'Cache-Control': 'private, max-age=3300',
        },
    });
}
