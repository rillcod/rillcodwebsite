import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Notification ID missing', 400);

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', id)
        .eq('user_id', ctx.user!.id)
        .single();

    if (error || !data) throw new AppError('Notification not found', 404);

    return NextResponse.json({ success: true, data });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
