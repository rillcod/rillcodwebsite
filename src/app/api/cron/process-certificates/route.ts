import { NextRequest, NextResponse } from 'next/server';
import { certificateService } from '@/services/certificate.service';

export const dynamic = 'force-dynamic';

// POST /api/cron/process-certificates
// Background job to generate PDFs for newly issued certificates
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const secret = req.headers.get('x-cron-secret') || authHeader?.replace('Bearer ', '');

    if (secret !== process.env.BILLING_CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await certificateService.processPendingCertificates();
        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[cron/process-certificates] Failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
