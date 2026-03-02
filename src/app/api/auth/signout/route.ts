import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

async function handleSignOut(req: NextRequest) {
    const cookieStore = await cookies();

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
                    cookieStore.delete({ name, ...options });
                },
            },
        }
    );

    // Sign out on the server — clears session cookies
    await supabase.auth.signOut();

    // Use the request's own origin so this works in any environment
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl, { status: 302 });
}

export async function POST(req: NextRequest) {
    return handleSignOut(req);
}

// GET support for direct link navigation (escape bar fallback)
export async function GET(req: NextRequest) {
    return handleSignOut(req);
}
