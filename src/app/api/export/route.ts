import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { exportService } from '@/services/export.service';

async function getHandler(req: Request, ctx: ApiContext) {
    if (!ctx.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'progress'; // progress, gradebook, certificate
    const format = (searchParams.get('format') || 'pdf') as 'pdf' | 'csv' | 'xlsx';
    const courseId = searchParams.get('course_id');

    try {
        let data: string;

        if (type === 'progress') {
            data = await exportService.generateProgressReport(ctx.user.id, format as 'pdf' | 'csv');
        } else if (type === 'certificate' && courseId) {
            data = await exportService.generateCertificate(ctx.user.id, courseId);
        } else if (type === 'gradebook' && ctx.user.tenantId) {
            data = await exportService.exportGradeBook(ctx.user.tenantId, format as 'csv' | 'xlsx');
        } else {
            return NextResponse.json({ success: false, error: 'Invalid export type' }, { status: 400 });
        }

        const filename = `${type}-${new Date().toISOString().split('T')[0]}.${format}`;

        return new NextResponse(Buffer.from(data, 'base64'), {
            headers: {
                'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });
    } catch (error) {
        console.error('Export error:', error);
        return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 });
    }
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
