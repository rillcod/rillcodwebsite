import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { portfolioService } from '@/services/portfolio.service';

async function getHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const portfolio = await portfolioService.getStudentPortfolio(ctx.user.id);
    return NextResponse.json({ success: true, data: portfolio });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
