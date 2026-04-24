import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';

    let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', ctx.user!.id)
        .order('created_at', { ascending: false });

    if (unreadOnly) {
        query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true, data });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
