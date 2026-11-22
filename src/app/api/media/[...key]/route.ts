import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { r2SignedUrl } from '@/lib/r2/client';
import { checkExamMaterialLock } from '@/lib/cbt/exam-material-lock';

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
 * Files are served directly from R2, which has zero egress fees — no origin bandwidth used.
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
    const { key } = await context.params;
    const r2Key = key.join('/');

    // Basic path validation — prevent directory traversal
    if (r2Key.includes('..') || r2Key.startsWith('/')) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Determine if this is a public folder that bypasses the auth check
    const isPublicPath = r2Key.startsWith('summer-school-receipts/');

    let userRole = 'student';
    if (!isPublicPath) {
        const user = await resolveUser(req);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Anti-cheating cross-account exam lockdown: block ANY student account from
        // opening locked course/lesson study files while an official exam is live.
        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const { data: profile } = await admin
            .from('portal_users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        userRole = String(profile?.role ?? 'student').toLowerCase();

        // Proprietary resource protection: students may view study materials inline
        // inside Rillcod Academy, but may NEVER force-download or share raw files.
        const isStaff = ['admin', 'teacher', 'school'].includes(userRole);
        if (!isStaff && req.nextUrl.searchParams.has('download')) {
            return NextResponse.json(
                { error: 'Downloading study materials is restricted to teachers and admins. Please view inside Rillcod Academy.' },
                { status: 403, headers: { 'Cache-Control': 'no-store' } },
            );
        }

        const lock = await checkExamMaterialLock(admin, {
            userRole,
            mediaPath: r2Key,
        });
        if (lock.locked) {
            return NextResponse.json(
                {
                    error: lock.reason || 'This study material is locked during an active examination.',
                    locked: true,
                    examTitle: lock.examTitle,
                    unlocksAt: lock.unlocksAt,
                },
                { status: 423, headers: { 'Cache-Control': 'no-store' } },
            );
        }
    }

    const { searchParams } = req.nextUrl;
    const isStaffViewer = ['admin', 'teacher', 'school'].includes(userRole);
    const isDownload = isStaffViewer && searchParams.has('download');
    const filename = searchParams.get('filename') ?? r2Key.split('/').pop() ?? 'file';

    let signedUrl: string;
    try {
        // Short-lived 5-minute signed URL for students (prevents link sharing), 1-hour for staff
        signedUrl = await r2SignedUrl(r2Key, isStaffViewer ? 3600 : 300, isDownload ? filename : undefined);
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.redirect(signedUrl, {
        status: 302,
        headers: {
            'Cache-Control': isStaffViewer ? 'private, max-age=3300' : 'private, no-store',
        },
    });
}
