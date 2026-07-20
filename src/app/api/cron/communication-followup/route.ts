import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runCommunicationFollowup } from '@/lib/communication/followup-runner';

import { loadOfficeAutomationControls } from '@/lib/communication/automation-controls';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const controls = await loadOfficeAutomationControls(admin);
    if (!controls.customer_followup_enabled) return NextResponse.json({ success: true, disabled: true, reason: 'customer_followup_switch' });
    return NextResponse.json(await runCommunicationFollowup(admin));
  } catch (error) {
    console.error('[communication-followup]', error);
    return NextResponse.json({ error: 'Communication follow-up failed.' }, { status: 500 });
  }
}
