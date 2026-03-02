import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { announcementsService } from '@/services/announcements.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const updateAnnouncementSchema = z.object({
    title: z.string().min(3).max(200).optional(),
    content: z.string().min(5).optional(),
    target_audience: z.enum(['all', 'students', 'teachers', 'admins']).optional(),
    is_active: z.boolean().optional(),
});

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Announcement ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    const data = await announcementsService.getAnnouncement(id, tenantId);

    return NextResponse.json({
        success: true,
        data
    });
}

async function putHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to edit announcements', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Announcement ID missing', 400);

    const { data, errorResponse } = await withValidation(req as any, updateAnnouncementSchema);
    if (errorResponse) return errorResponse;

    const tenantId = ctx.user?.tenantId;
    const updated = await announcementsService.updateAnnouncement(id, data!, tenantId);

    return NextResponse.json({
        success: true,
        data: updated
    });
}

async function deleteHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school' && ctx.user?.role !== 'teacher') {
        throw new AppError('Not authorized to delete announcements', 403, true);
    }

    const id = ctx.params?.id;
    if (!id) throw new AppError('Announcement ID missing', 400);

    const tenantId = ctx.user?.tenantId;
    await announcementsService.deleteAnnouncement(id, tenantId);

    return NextResponse.json({
        success: true,
        message: 'Announcement deleted successfully'
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true })(req, ctx);
export const PUT = (req: any, ctx: any) => withApiProxy(putHandler, { requireAuth: true })(req, ctx);
export const DELETE = (req: any, ctx: any) => withApiProxy(deleteHandler, { requireAuth: true })(req, ctx);
