import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';

async function getHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const analytics = await analyticsService.getStudentAnalytics(ctx.user.id, ctx.user?.tenantId);
    return NextResponse.json({ success: true, data: analytics });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
