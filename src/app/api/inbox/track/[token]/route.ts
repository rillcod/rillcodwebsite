import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// 1×1 transparent GIF — returned for every request so email clients don't show broken image
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const PIXEL_RESPONSE = () =>
  new NextResponse(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma':        'no-cache',
      'Expires':       '0',
    },
  });

function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function decodeToken(raw: string): { reportId?: string; email?: string; type?: string } | null {
  // Try base64url first (server-generated), then plain base64 (browser btoa fallback)
  for (const enc of ['base64url', 'base64'] as BufferEncoding[]) {
    try {
      return JSON.parse(Buffer.from(raw, enc).toString('utf-8'));
    } catch {
      // try next
    }
  }
  return null;
}

// GET /api/inbox/track/[token]
// Records a report email open event in email_events and returns a 1×1 transparent GIF.
// Token payload: { reportId: string; email: string; type: 'report' }
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = decodeToken(token);

  if (!payload?.reportId || payload.type !== 'report') {
    return PIXEL_RESPONSE();
  }

  // Fire-and-forget: GIF must return immediately regardless of DB latency
  ;(async () => {
    const db = adminClient();
    const reportId = payload.reportId as string;

    // Verify the report exists before writing the event
    const { data: report } = await db
      .from('student_progress_reports')
      .select('id, student_id')
      .eq('id', reportId)
      .maybeSingle();

    if (!report) return;

    // Insert typed email_events row
    await db.from('email_events').insert({
      report_id:   reportId,
      event:       'opened',
      email:       payload.email ?? null,
      occurred_at: new Date().toISOString(),
    });
  })().catch(() => null);

  return PIXEL_RESPONSE();
}
