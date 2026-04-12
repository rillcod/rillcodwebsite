import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { searchService, type SearchFilters } from '@/services/search.service';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ 
            success: true, 
            data: { 
                courses: [], 
                programs: [], 
                teachers: [],
                lessons: [],
                assignments: []
            } 
        });
    }

    // Build filters from query parameters
    const filters: SearchFilters = {
        query,
        type: (searchParams.get('type') as any) || 'all',
        status: searchParams.get('status') || undefined,
        skillLevel: searchParams.get('skill_level') || undefined,
        dateFrom: searchParams.get('date_from') || undefined,
        dateTo: searchParams.get('date_to') || undefined,
        courseId: searchParams.get('course_id') || undefined,
        programId: searchParams.get('program_id') || undefined,
    };

    const results = await searchService.searchAll(query, ctx.user?.tenantId, filters);
    return NextResponse.json({ success: true, data: results });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler)(req, ctx);
