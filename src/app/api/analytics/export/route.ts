import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { analyticsService } from '@/services/analytics.service';

/**
 * GET /api/analytics/export
 * Exports analytics data in CSV format
 */
async function exportDataHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || 'performance') as 'performance' | 'engagement';
    const schoolId = searchParams.get('schoolId');

    const data = await analyticsService.exportData(type, { schoolId });

    if (!data || data.length === 0) {
        return NextResponse.json({ error: 'No data to export' }, { status: 404 });
    }

    // Convert to CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map((row: any) => headers.map(header => JSON.stringify(row[header])).join(','))
    ];
    const csvString = csvRows.join('\n');

    return new NextResponse(csvString, {
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="analytics_${type}_${new Date().toISOString().split('T')[0]}.csv"`
        }
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(exportDataHandler, { roles: ['admin', 'teacher'] })(req, ctx);
