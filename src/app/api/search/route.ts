import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { searchService } from '@/services/search.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ success: true, data: { courses: [], programs: [], teachers: [] } });
    }

    const results = await searchService.searchAll(query, ctx.user?.tenantId);
    return NextResponse.json({ success: true, data: results });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
