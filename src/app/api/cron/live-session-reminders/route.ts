import { NextResponse } from 'next/server';
import { liveSessionService } from '@/services/live-session.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await liveSessionService.sendSessionReminders();
    return NextResponse.json({ success: true, ...result });
}
