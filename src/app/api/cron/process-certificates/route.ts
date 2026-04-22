import { NextRequest, NextResponse } from 'next/server';
import { certificateService } from '@/services/certificate.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

// GET or POST /api/cron/process-certificates
export async function GET(req: NextRequest) {
    return handleProcess(req);
}

export async function POST(req: NextRequest) {
    return handleProcess(req);
}

async function handleProcess(req: NextRequest) {
    if (!isValidCronSecret(extractCronSecret(req))) {
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
