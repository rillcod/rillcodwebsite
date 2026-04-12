import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { notificationService } from '@/services/notifications.enhanced';
import { AppError } from '@/lib/errors';

async function listHandler(req: Request, ctx: ApiContext) {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', ctx.user!.id)
        .order('created_at', { ascending: false });

    if (unreadOnly) {
        query = query.eq('is_read', false);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new AppError(error.message, 500);

    const unreadCount = await notificationService.getUnreadNotificationCount(ctx.user!.id);

    return NextResponse.json({ success: true, data: { notifications: data || [], unreadCount } });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    if (action === 'mark_all_as_read') {
        await notificationService.markAllAsRead(ctx.user.id);
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

export const GET = (req: any, ctx: any) => withApiProxy(listHandler)(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler)(req, ctx);
