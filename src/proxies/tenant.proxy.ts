import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function tenantproxy(req: NextRequest, res: NextResponse) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res;
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
            getAll() { return req.cookies.getAll(); },
            setAll() { } // Set cookies is handled in main proxy
        }
    });

    let user = null;
    try {
        const { data } = await supabase.auth.getUser();
        user = data?.user ?? null;
    } catch (err: any) {
        // Handle Supabase SSR lock contention (AbortError / "Lock broken by another request")
        // Treat as unauthenticated — the request will be retried or handled by auth checks downstream
        if (err?.name === 'AbortError' || err?.message?.includes('Lock broken')) {
            return res;
        }
        // Re-throw unexpected errors
        throw err;
    }

    if (user) {
        // Inject user_id into headers
        res.headers.set('x-user-id', user.id);

        // Get school_id from portal_users
        // Avoid multiple queries, fetch role and school_id
        const { data: profile } = await supabase
            .from('portal_users')
            .select('school_id, role')
            .eq('id', user.id)
            .maybeSingle();

        if (profile) {
            if (profile.school_id) {
                res.headers.set('x-tenant-id', profile.school_id);
            }
            if (profile.role) {
                res.headers.set('x-user-role', profile.role);
            }
        }
    }

    return res;
}
