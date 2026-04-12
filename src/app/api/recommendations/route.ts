import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { recommendationsService } from '@/services/recommendations.service';

async function getHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    const recommendations = await recommendationsService.getRecommendations(ctx.user.id, limit);
    return NextResponse.json({ success: true, data: recommendations });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
