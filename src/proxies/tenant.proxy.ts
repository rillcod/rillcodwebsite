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

    const { data: { user } } = await supabase.auth.getUser();

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
