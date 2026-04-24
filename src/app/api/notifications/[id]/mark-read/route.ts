import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function postHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Notification ID missing', 400);

    const supabase = await createClient();
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', ctx.user!.id);

    if (error) throw new AppError(error.message, 500);

    return NextResponse.json({ success: true, message: 'Notification marked as read' });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler)(req, ctx);
