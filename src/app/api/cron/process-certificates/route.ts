import { NextRequest, NextResponse } from 'next/server';
import { certificateService } from '@/services/certificate.service';

export const dynamic = 'force-dynamic';

// GET or POST /api/cron/process-certificates
export async function GET(req: NextRequest) {
    return handleProcess(req);
}

export async function POST(req: NextRequest) {
    return handleProcess(req);
}

async function handleProcess(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const secret = authHeader?.replace('Bearer ', '');

    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
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
