import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseAuthStorageKey } from '@/lib/auth/session-recovery';

async function handleSignOut(req: NextRequest) {
    const cookieStore = await cookies();
    const wantsJson =
        req.headers.get('accept')?.includes('application/json') ||
        req.nextUrl.searchParams.get('json') === '1' ||
        req.headers.get('x-rillcod-signout') === '1';

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name: string, options: any) {
                    try {
                        cookieStore.set({ name, value: '', ...options, maxAge: 0 });
                    } catch {
                        cookieStore.delete({ name, ...options });
                    }
                },
            },
        }
    );

    // Ask Supabase to revoke/clear the session. An invalid or already-rotated
    // refresh token can make this return an error, so cookie expiry below is
    // deliberately unconditional.
    await supabase.auth.signOut().catch(() => null);

    for (const cookie of cookieStore.getAll()) {
        if (!isSupabaseAuthStorageKey(cookie.name)) continue;
        cookieStore.set({
            name: cookie.name,
            value: '',
            path: '/',
            maxAge: 0,
            expires: new Date(0),
            sameSite: 'lax',
        });
    }

    if (wantsJson) {
        return NextResponse.json({ ok: true });
    }

    // Use the request's own origin so this works in any environment
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('signed_out', '1');
    return NextResponse.redirect(loginUrl, { status: 302 });
}

export async function POST(req: NextRequest) {
    return handleSignOut(req);
}

// GET support for direct link navigation (escape bar fallback)
export async function GET(req: NextRequest) {
    return handleSignOut(req);
}
