import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { announcementsService } from '@/services/announcements.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

export const createAnnouncementSchema = z.object({
    title: z.string().min(3).max(200),
    content: z.string().min(5),
    target_audience: z.enum(['all', 'students', 'teachers', 'admins']).default('all'),
    is_active: z.boolean().default(true),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const url = new URL(req.url);
    const audience = url.searchParams.get('audience') || undefined;
    const limitParam = parseInt(url.searchParams.get('limit') || '20');

    const tenantId = ctx.user?.tenantId;
    const data = await announcementsService.listAnnouncements(tenantId, audience, limitParam);

    return NextResponse.json({
        success: true,
        data
    });
}

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to post announcements', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createAnnouncementSchema);
    if (errorResponse) return errorResponse;

    const result = await announcementsService.createAnnouncement(
        data!,
        ctx.user!.id,
        ctx.user?.tenantId
    );

    return NextResponse.json({
        success: true,
        data: result
    }, { status: 201 });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
