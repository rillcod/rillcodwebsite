import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { publishDueNewsletters } from '@/lib/newsletters/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET|POST /api/cron/publish-newsletters
 * Publishes newsletters whose scheduled_for has passed. Optional dedicated schedule — the same
 * work also runs from the existing process-notifications sweep, so no new cron entry is required.
 */
async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { count } = await publishDueNewsletters(adminClient());
    return NextResponse.json({ success: true, count });
  } catch (err: any) {
    console.error('[cron/publish-newsletters] error:', err);
    return NextResponse.json({ error: err?.message || 'failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
