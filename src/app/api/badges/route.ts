import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { badgeService } from '@/services/badge.service';

async function getHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const progress = await badgeService.getBadgeProgress(ctx.user.id);
    return NextResponse.json({ success: true, data: progress });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
