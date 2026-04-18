import { NextRequest, NextResponse } from 'next/server';
import { liveSessionService } from '@/services/live-session.service';

export const dynamic = 'force-dynamic';

async function handleRequest(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await liveSessionService.sendSessionReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[cron/live-session-reminders] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handleRequest(req); }
export async function POST(req: NextRequest) { return handleRequest(req); }
